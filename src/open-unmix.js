const tf = require('@tensorflow/tfjs');

const fs = require('fs');
const config = require('../config/config.json');

tf.ENV.set('WEBGL_CONV_IM2COL', false);

// Fourier Params
const FRAME_LENGTH = config.fourierParams.frameLength
const HOP_LENGTH = config.fourierParams.hopLength
const FFT_SIZE = config.fourierParams.fftSize

// MODEL input dimensions
const N_FREQUENCIES = config.modelInput.N_FREQUENCIES
const N_FRAMES = config.modelInput.N_FRAMES
const N_CHANNELS = config.modelInput.N_CHANNELS
const N_BATCHES = config.modelInput.N_BATCHES

let modelPath_
// Enables production mode which disables correctness checks in favor of performance.
tf.enableProdMode()

let ifftWindowTF = inverse_stft_window_fn(HOP_LENGTH, FRAME_LENGTH)
const specParams = {
    winLength: FRAME_LENGTH,
    hopLength: HOP_LENGTH,
    fftLength: FFT_SIZE
};

let model

/*--------------------- Functions ------------------------------------------------------------------------------------------------------*/

/**
 *
 * @param url
 * @returns {Promise<GraphModel>}
 */
async function loadModel(url){
    this.model = await tf.loadGraphModel(url)
}

/**
 *
 * @param channel0
 * @param channel1
 * @returns {Promise<void>} with vocals and accompaniment
 */
async function modelProcess(channel0, channel1, target_name){
    console.log("Start processing...")
    const numPatches = Math.floor(Math.floor((channel0.length - 1) / HOP_LENGTH) / N_FRAMES) + 1;

    console.log("Num patches " + numPatches)

    let start = 0
    let target_stem = [[],[]];
    let back_stem = [[],[]];
    let chunk = HOP_LENGTH * (N_FRAMES - 1)
    let end = chunk
    for (let i = 0; i < numPatches; i++) {
        console.log("Start processing chunk: "+i + "/" +numPatches)
        const result0 = preProcessing(channel0.slice(start, end), specParams);
        const result1 = preProcessing(channel1.slice(start, end), specParams);
        let predict = await modelPredict([result0, result1], specParams)
        target_stem[0][i] = predict[0][0]
        target_stem[1][i] = predict[0][1]
        back_stem[0][i] = predict[1][0]
        back_stem[1][i] = predict[1][1]
        console.log("End processing chunk: "+i+ "/" +numPatches)
        start+=chunk
        end = start+chunk
        result0.dispose()
        result1.dispose()
    }

    let target = createBuffer(target_stem, channel0.length, channel1.length)
    let back = createBuffer(back_stem, channel0.length, channel1.length)

    let buff_target = createWave(target, target_name + ".wav")
    let buff_back = createWave(back, "accompaniment.wav")

    //saveFile(buff_back, "Example.wav");
    return {
        stems:[
            {
                name:target_name,
                data:buff_target
            },
            {
                name:"accompaniment",
                data:buff_back
            }
        ]
    }
}

function createBuffer(channels, originalChannelLength1, originalChannelLength2){
    let processedSignal0 = channels[0].flat()
    let processedSignal1 = channels[1].flat()

    processedSignal0 = processedSignal0.slice(0, originalChannelLength1)
    processedSignal1 = processedSignal1.slice(0, originalChannelLength2)

    // Generate buffer dic to create waveFile
    return {
        numberOfChannels: 2,
        sampleRate: 44100,
        channelData: [processedSignal0, processedSignal1]
    }
}

/**
 *
 * @param resultSTFT
 * @param specParams
 * @returns {Promise<[][]>}
 */
async function modelPredict(resultSTFT, specParams){

    let result_vocals = [[],[]]
    let result_background = [[],[]]

    let input = createInput(resultSTFT[0], resultSTFT[1], 0)

    // prediction
    const output = await this.model.executeAsync(input["model_input"])

    let estimate = tf.tidy(() => {
        return tf.mul(
            tf.complex(output, tf.zeros([N_BATCHES, N_CHANNELS, N_FREQUENCIES, N_FRAMES])),
            tf.complex(tf.cos(input["mix_angle"]),tf.sin(input["mix_angle"]))
        )
    })

    let vocals = postProcessing(estimate, specParams, 1.0)

    let estimate_background = tf.tidy(() => {
        return tf.mul(
            tf.complex((input["model_input"].sub(output)), tf.zeros([N_BATCHES, N_CHANNELS, N_FREQUENCIES, N_FRAMES])),
            tf.complex(tf.cos(input["mix_angle"]),tf.sin(input["mix_angle"]))
        )
    })

    let background = postProcessing(estimate_background, specParams, 1.0)


    // Push into result 2 channels
    result_vocals = [[...result_vocals[0],...vocals[0]], [...result_vocals[1],...vocals[1]]]
    result_background = [[...result_background[0],...background[0]], [...result_background[1],...background[1]]]
    //}

    input["mix_angle"].dispose()
    input["model_input"].dispose()


    return [result_vocals, result_background]
}

/**
 *  A function that applies TF's STFT to a single Float32Array (a channel)
 * @param {*} channel
 * @param specParams
 * @returns A Float32Array that should be similar to the original channel
 */
function preProcessing(channel, specParams){
    let input = tf.tensor1d(channel, "float32");

    if (input.shape[0] < HOP_LENGTH * (N_FRAMES - 1)) {
        // chunk is too short so lets pad it at the end
        input = tf.pad(input, [[0, (HOP_LENGTH * (N_FRAMES - 1) - input.shape[0])]])
    }
    // Symetrically pad the signal for for STFT
    input = padSignal(input, specParams, true); //multiple of 1024 (hop_size/frame_size?)
    // Perform stft
    let resultSTFT = tf.signal.stft(
        input,
        specParams.winLength,
        specParams.hopLength,
        specParams.fftLength
    );

    return resultSTFT
}

/**
 * Pad the signal for song soft beginning
 * @param signal
 * @param specParams
 * @param forward insert or remove pad
 * @returns Float32Array with padded signal
 */
function padSignal(signal, specParams, forward){
    let pad = Math.floor((specParams.fftLength - specParams.hopLength))
    //Insert padding
    if(forward){
        signal = tf.pad(signal, [[pad, pad]])
        return signal
    }else{
        signal = tf.slice(signal, [pad], [(signal.shape - (2 * pad))])
        return signal
    }
}


/**
 *
 * @param estimate
 * @param specParams
 * @param factor
 * @returns Float32Array[]
 */
function postProcessing( estimate, specParams, factor){
    // Reshaping to separate channels and remove "batch" dimension, so we can compute the istft
    let estimateReshaped = tf.tidy(() => {

        let estimateReshapedR = tf.real(estimate) //[0] == channel 0, [1] == channel 1
        let estimateReshapedI = tf.imag(estimate)

        estimateReshapedR = estimateReshapedR.unstack(1).map(tensor => tensor.squeeze()) // Tensor[]
        estimateReshapedI = estimateReshapedI.unstack(1).map(tensor => tensor.squeeze()) // Tensor[]

        // surmount the problem permuting each dimension // before [ 2049, 198 ] -> after [ 198, 2049 ]
        estimateReshapedI[0] = tf.transpose(estimateReshapedI[0])
        estimateReshapedI[1] = tf.transpose(estimateReshapedI[1])
        estimateReshapedR[0] = tf.transpose(estimateReshapedR[0])
        estimateReshapedR[1] = tf.transpose(estimateReshapedR[1])

        // Return channel 0 and 1 as complex numbers
        return [tf.complex(estimateReshapedR[0], estimateReshapedI[0]),tf.complex(estimateReshapedR[1], estimateReshapedI[1])]
    })

    let result = []
    for (let input of estimateReshaped){
        let resultISTFT = istft(input, specParams, factor);
        let signal = tf.tensor1d(resultISTFT)
        signal = padSignal(signal, specParams, false)
        result.push(signal.arraySync())
        signal.dispose()
    }

    return result
}

/**
 * Creates input to the model
 * @param res0
 * @param res1
 * @param slice_start
 * @returns {{mix_angle: *, model_input: *}}
 */
function createInput(res0, res1, slice_start){
    let absChannel0 = tf.abs(res0).slice([slice_start,0], [N_FRAMES, N_FREQUENCIES])
    let absChannel1 = tf.abs(res1).slice([slice_start,0], [N_FRAMES, N_FREQUENCIES])
    const model_input = tf.stack([absChannel0, absChannel1]).transpose([0, 2, 1]).expandDims(0)

    let chan0R = tf.real(res0).slice([slice_start,0], [N_FRAMES, N_FREQUENCIES])
    let chan0I = tf.imag(res0).slice([slice_start,0], [N_FRAMES, N_FREQUENCIES])

    let chan1R = tf.real(res1).slice([slice_start,0], [N_FRAMES, N_FREQUENCIES])
    let chan1I = tf.imag(res1).slice([slice_start,0], [N_FRAMES, N_FREQUENCIES])

    let chanR = tf.stack([chan0R.arraySync(), chan1R.arraySync()]).transpose([0, 2, 1]).expandDims(0)
    let chanI = tf.stack([chan0I.arraySync(), chan1I.arraySync()]).transpose([0, 2, 1]).expandDims(0)

    let mix_stft = tf.complex(chanR, chanI)

    let mix_angle = tf.atan2(tf.imag(mix_stft), tf.real(mix_stft))
    return {"model_input":model_input, "mix_angle":mix_angle}
}

/**
 *
 * @param data Float32Array
 * @param padding number | number[]
 * @returns {Float32Array}
 */
function padConstant(data, padding) {
    let padLeft, padRight;
    if (typeof (padding) === 'object') {
        [padLeft, padRight] = padding;
    } else {
        padLeft = padRight = padding;
    }
    const out = new Float32Array(data.length + padLeft + padRight);
    out.set(data, padLeft);
    return out;
}

/**
 *
 * @param data Float32Array
 * @param length number
 * @returns {Float32Array}
 */
function padCenterToLength(data, length) {
    // If data is longer than length, error!
    if (data.length > length) {
        throw new Error('Data ' + data.length + ' is longer than length ' + length);
    }
    const paddingLeft = Math.floor((length - data.length) / 2);
    const paddingRight = length - data.length - paddingLeft;
    return padConstant(data, [paddingLeft, paddingRight]);
}

/**
 * Inverse Short-term fourier transform matching python's
 * Inspired in
 * https://github.com/magenta/magenta-js/blob/41e1575fbb2d2ef49077c8630896f562cab818ac/music/src/gansynth/audio_utils.ts
 * @param complex output of STFT
 * @param params Parameters for computing a inverse spectrogram from audio.
 * @param factor adjust normalization factor
 *
 params {
    hopLength?: number;
    winLength?: number;
    nFft?: number;
   }
 * @returns {Float32Array} reconstructed signal
 */
function istft(complex, params, factor) {
    const winFactor = factor || 1.0;
    const nFrames = complex.shape[0];
    const nFft = params.fftLength || enclosingPowerOfTwo(complex.shape[1]);
    const winLength = params.winLength || nFft;
    const hopLength = params.hopLength || Math.floor(winLength / 2);

    // Pad the window to be the size of nFft. Only if nFft != winLength.
    // In our case we dont need to pad since nFfft != winLength (always)
    if(nFft !== winLength){
        let ifftWindow = ifftWindowTF.arraySync();
        ifftWindow = padCenterToLength(ifftWindow, nFft);
        ifftWindowTF = tf.tensor1d(ifftWindow)
    }

    // Compute output expected signal length
    const expectedSignalLen = nFft + hopLength * (nFrames - 1);

    const istftResult = new Float32Array(expectedSignalLen);

    // Perform inverse ffts
    let irfftTF = complex.irfft()

    // Adjust normalization for 2096/1024 (factor of 1.0 with stft/istft)
    // used by the model
    let normalizationFactor = tf.mul(ifftWindowTF, tf.tensor(winFactor));

    // Apply window
    let res = tf.mul(irfftTF, normalizationFactor).arraySync();

    // Overlap and add
    for(let i = 0; i < nFrames; i++){
        let sample = i * hopLength;
        let yTmp = res[i];
        yTmp = add(yTmp, istftResult.slice(sample, sample + nFft));
        istftResult.set(yTmp, sample);
    }

    return istftResult
}

/**
 *
 * @param frame_step
 * @param frame_length
 * @param forward_window_fn
 * @returns {Tensor}
 */
function inverse_stft_window_fn(frame_step, frame_length, forward_window_fn = (f) => tf.signal.hannWindow(f)){
    const forward_window = forward_window_fn(frame_length)
    let denom = tf.square(forward_window)
    const overlaps = Math.ceil(frame_length/frame_step) // -(-frame_length / frame_step) but js
    denom = tf.pad(denom, [[0, overlaps * frame_step - frame_length]])
    denom =  denom.reshape([overlaps, frame_step])
    denom = tf.sum(denom, 0, keepdims=true)
    denom = tf.tile(denom, [overlaps, 1])
    denom = denom.reshape([overlaps * frame_step])
    return tf.div(forward_window, denom.slice(0, frame_length))//forward_window / denom.slice(0, frame_length)
}

/**
 * Return 2**N for integer N such that 2**N >= value.
 * @param value
 * @returns {number} smallest power of 2 enclosing
 */
function enclosingPowerOfTwo(value) {
    return Math.floor(Math.pow(2, Math.ceil(Math.log(value) / Math.log(2.0))));
}

/**
 * Add two arrays
 * @param arr0
 * @param arr1
 * @returns {Float32Array|null}
 */
function add(arr0, arr1) {
    if (arr0.length !== arr1.length) {
        console.error(
            `Array lengths must be equal to add: ${arr0.length}, ${arr1.length}`);
        return null;
    }
    const out = new Float32Array(arr0.length);
    for (let i = 0; i < arr0.length; i++) {
        out[i] = arr0[i] + arr1[i];
    }
    return out;
}

/**
 * Convert a audio-buffer segment to a Blob using WAVE representation
 * Thanks https://koekestra.com/spleeter_js/
 * @param outputBuffer
 * @param path
 * @returns {Blob}
 */
function createWave(outputBuffer, path) {
    const length = outputBuffer.channelData[0].length * 2 * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);                         // file length - 8
    setUint32(0x45564157);                         // "WAVE"

    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                  // PCM (uncompressed)
    setUint16(2);
    setUint32(outputBuffer.sampleRate);
    setUint32(outputBuffer.sampleRate * 2 * outputBuffer.numberOfChannels);
    setUint16(2 * outputBuffer.numberOfChannels);  // block-align
    setUint16(16);                                 // 16-bit (hardcoded in this demo)

    setUint32(0x61746164);                         // "data" - chunk
    setUint32(length - pos - 4);                   // chunk length

    // write interleaved data
    let offset = 0;
    while(pos < length) {
        for(let ch = 0; ch < 2; ch++) {             // interleave channels
            let sample = Math.max(-1, Math.min(1, outputBuffer.channelData[ch][offset])); // 必要ないはずだけど念のため clamp
            sample = ((sample < 0) ? sample * 0x8000 : sample * 0x7fff) | 0; // scale to 16-bit signed int
            view.setInt16(pos, sample, true);          // write 16-bit sample
            pos += 2;
        }
        offset++;                                     // next source sample
    }

    return new Blob([buffer], {type: "audio/wav"});

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}

exports.loadModel = loadModel
exports.modelProcess = modelProcess

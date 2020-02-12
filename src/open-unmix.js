const tf = require('@tensorflow/tfjs-node');

tf.ENV.set('WEBGL_CONV_IM2COL', false);

// Only used by node version
const fs = require('fs');
const decode = require('audio-decode');
const Lame = require("node-lame").Lame;

const FRAME_LENGTH = 2048
const HOP_LENGTH = 1024
const FFT_SIZE = 2048
const SAMPLE_RATE = 44100

// MODEL input dimensions
const N_FREQUENCIES = 1025
const N_FRAMES = 256
const N_CHANNELS = 2
const N_BATCHES = 1

let modelPath_ = 'http://localhost:5000/model/model.json'

tf.enableProdMode()

let ifftWindowTF = inverse_stft_window_fn(HOP_LENGTH,FRAME_LENGTH)

const specParams = {
    winLength: FRAME_LENGTH,
    hopLength: HOP_LENGTH,
    fftLength: FFT_SIZE
};

let model

let aud = {
}
/*--------------------- Functions ------------------------------------------------------------------------------------------------------*/
async function loadModel(url){
    let modelPath = url || modelPath_
    model = await tf.loadGraphModel(modelPath);
}

/**
 * Returns decoded file as buffer
 * @param path
 * @return buffer to process
 */
async function decodeFile(path){
    const decoder = new Lame({
        output: "buffer",
        bitrate: 192,
    }).setFile(path);

    return decoder
        .decode()
        .then(() => {
            return decoder.getBuffer();
        })
        .catch(error => {
            console.log(error)
        });
}


/**
 * Decode the buffer to float32Array with expected channels
 * @param buffer
 * @return AudioBuffer{
 *     length,
 *     numberOfChannels
 *     sampleRate,
 *     duration
 *     _data:[]
 *     _channelData[numberOfChannels]
 * }
 */
async function decodeFromBuffer(buffer){
    return decode(buffer, (err, audioBuffer) => {
        return audioBuffer
    });
}

async function modelProcess(url,a, b){
    modelPath_ = url || modelPath_
    const numPatches = Math.floor(Math.floor((a.length - 1) / HOP_LENGTH) / N_FRAMES) + 1;

    console.log("Num patches " + numPatches)

    let start = 0
    let vocal_stem = [[],[]];
    let back_stem = [[],[]];
    let chunk = HOP_LENGTH * (N_FRAMES - 1)
    let end = chunk
    for (let i = 0; i < numPatches; i++) {
        console.log("Start processing chunk: "+i)
        const result0 = preProcessing(a.slice(start, end), specParams);
        const result1 = preProcessing(b.slice(start, end), specParams);
        let predict = await modelPredict([result0, result1], specParams)
        vocal_stem[0][i] = predict[0][0]
        vocal_stem[1][i] = predict[0][1]
        back_stem[0][i] = predict[1][0]
        back_stem[1][i] = predict[1][1]
        console.log("End processing chunk: "+i)
        start+=chunk
        end = start+chunk
        result0.dispose()
        result1.dispose()
    }

    // let vocals = createBuffer(vocal_stem, specParams)
    // let back = createBuffer(back_stem,specParams)
    //
    // let buff_vocals = createWave(vocals, "vocals.wav")
    // let buff_back = createWave(back, "accompaniment.wav")
    // //saveFile("Example.wav", "audio/wav", buff);
    // return {
    //     stems:[
    //         {
    //             name:"vocals",
    //             data:buff_vocals
    //         },
    //         {
    //             name:"accompaniment",
    //             data:buff_back
    //         }
    //     ]
    // }
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
    let number_of_frames = resultSTFT[0].shape[0]

    let input = createInput(resultSTFT[0], resultSTFT[1], 0)

    // prediction
    const output = tf.tidy(() => {
        return model.predict(input["model_input"]);
    })

    let estimate = tf.tidy(() => {
        return tf.mul(
            tf.complex(output, tf.zeros([N_FRAMES, N_BATCHES, N_CHANNELS, N_FREQUENCIES])),
            tf.complex(tf.cos(input["mix_angle"]),tf.sin(input["mix_angle"]))
        )
    })

    let vocals = postProcessing(estimate, specParams, 1.0)

    let estimate_background = tf.tidy(() => {
        return tf.mul(
            tf.complex((input["model_input"].sub(output)), tf.zeros([N_FRAMES, N_BATCHES, N_CHANNELS, N_FREQUENCIES])),
            tf.complex(tf.cos(input["mix_angle"]),tf.sin(input["mix_angle"]))
        )
    })

    let background = postProcessing(estimate_background, specParams, 1.0)


    // Push into result 2 channels
    result_vocals = [[...result_vocals[0],...vocals[0]], [...result_vocals[1],...vocals[1]]]
    result_background = [[...result_background[0],...background[0]], [...result_background[1],...background[1]]]
    //}

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
    //Insert padding)
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
        let estimateReshapedR = tf.real(estimate)
        let estimateReshapedI = tf.imag(estimate)
        estimateReshapedR = estimateReshapedR.unstack(2).map(tensor => tensor.squeeze()) // Tensor[]
        estimateReshapedI = estimateReshapedI.unstack(2).map(tensor => tensor.squeeze()) // Tensor[]
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
    const model_input = tf.stack([absChannel0, absChannel1]).transpose([1, 0, 2]).expandDims(1)

    //
    let chan0R = tf.real(res0).slice([slice_start,0], [N_FRAMES, N_FREQUENCIES])
    let chan0I = tf.imag(res0).slice([slice_start,0], [N_FRAMES, N_FREQUENCIES])

    let chan1R = tf.real(res1).slice([slice_start,0], [N_FRAMES, N_FREQUENCIES])
    let chan1I = tf.imag(res1).slice([slice_start,0], [N_FRAMES, N_FREQUENCIES])

    let chanR = tf.stack([chan0R.arraySync(), chan1R.arraySync()]).transpose([1, 0, 2]).expandDims(1)
    let chanI = tf.stack([chan0I.arraySync(), chan1I.arraySync()]).transpose([1, 0, 2]).expandDims(1)

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
        throw new Error('Data ' + data.length + 'is longer than length ' + length);
    }
    const paddingLeft = Math.floor((length - data.length) / 2);
    const paddingRight = length - data.length - paddingLeft;
    return padConstant(data, [paddingLeft, paddingRight]);
}

/**
 *
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
    const nFft = params.nFft || enclosingPowerOfTwo(complex.shape[1]);
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
function inverse_stft_window_fn(frame_step, frame_length, forward_window_fn = (f) => tf.hannWindow(f)){
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

// Convert a audio-buffer segment to a Blob using WAVE representation
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
    setUint16(2); // numOfChan);
    setUint32(outputBuffer.sampleRate);
    setUint32(outputBuffer.sampleRate * 2 * outputBuffer.numberOfChannels); //abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(2 * outputBuffer.numberOfChannels); // numOfChan * 2);                      // block-align
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

    // create Blob

    //used by node
    let buff = new Buffer.from(buffer)
    fs.open(path, 'w', function(err, fd) {
        if (err) {
            throw 'error opening file: ' + err;
        }
        fs.write(fd, buff, 0, buff.length, null, function(err) {
            if (err) throw 'error writing file: ' + err;
            fs.close(fd, function() {
                console.log('file written');
            })
        });
    });

    //used by pure js
    // return new Blob([buffer], {type: "audio/wav"});

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}

exports.preProcessing = preProcessing;
exports.istft = istft;
module.exports.decodeFile = decodeFile;
exports.postProcessing = postProcessing;
exports.decodeFromBuffer = decodeFromBuffer
exports.createWave = createWave
exports.loadAndPredict = modelPredict
exports.loadModel = loadModel
exports.padSignal = padSignal
exports.aud = aud
exports.modelProcess = modelProcess
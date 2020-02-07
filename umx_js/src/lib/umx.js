import * as tf from "@tensorflow/tfjs"

tf.ENV.set('WEBGL_CONV_IM2COL', false);

const DEBUG = false

const FRAME_LENGTH = 2048
const HOP_LENGTH = 1024
const FFT_SIZE = 2048
const SAMPLE_RATE = 44100
const PATCH_LENGTH = 256


const FREQUENCES = 1025 //2049
const FRAMES = 256 //100
const N_CHANNELS = 2
const N_BATCHES = 1
const PADDING = 8 // Padding for model prediction

// STFT-ISTFT params:
const specParams = {
    winLength: FRAME_LENGTH,
    hopLength: HOP_LENGTH,
    fftLength: FFT_SIZE
};

tf.enableProdMode()

let ifftWindowTF = inverse_stft_window_fn(HOP_LENGTH,FRAME_LENGTH)
let model 
/*--------------------- Functions ------------------------------------------------------------------------------------------------------*/
let aud = {}

function readFile(file){ // Maybe rename this to be different from japanese guy? 
    const fileReader = new FileReader()
    fileReader.onerror = function(){ console.log("Error when reading the file") }

    fileReader.onload = function(file){
        decodeFile(file.name, fileReader.result)
    }
    fileReader.readAsArrayBuffer(file)
}

function decodeFile(fileName, arrBuffer){
    const audioContext = new AudioContext({"sampleRate":SAMPLE_RATE})
    audioContext.decodeAudioData(arrBuffer,
            function(data){
                const source = audioContext.createBufferSource()
                source.buffer = data
                if(source.buffer.sampleRate != SAMPLE_RATE || source.buffer.numberOfChannels != 2){
                    console.log(source.buffer.sampleRate, source.buffer.numberOfChannelst)
                    alert("Sorry, we can oly process songs with a 44100 sample rate and 2 channels")
                    throw new Error('Cannot process song')
                }
                aud.src = [source.buffer.getChannelData(0), source.buffer.getChannelData(1)]
                return
            }
    , () => {console.log("Error on decoding audio context")})
}


async function modelProcess(url){
    
    let path = url + "model/model.json"
    const numPatches = Math.floor(Math.floor((aud.src[0].length - 1) / HOP_LENGTH) / PATCH_LENGTH) + 1;

    console.log("Num patches " + numPatches)
    model = await tf.loadGraphModel(path);
    let start = 0
    let channel0_stem = [];
    let channel1_stem = [];
    let chunk = HOP_LENGTH * 255//Math.floor(aud.src[0].length / numPatches)
    let end = chunk
    for (let i = 0; i < numPatches; i++) {
        console.log("Start processing chunk: "+i)
        const result0 = preProcessing(aud.src[0].slice(start, end), specParams);
        const result1 = preProcessing(aud.src[1].slice(start, end), specParams);
        let predict = await loadAndPredict(path, [result0, result1], specParams)
        channel0_stem[i] = predict[0];
        channel1_stem[i] = predict[1];
        console.log("End processing chunk: "+i)
        start+=chunk+1
        end = start+chunk
    }

    let processedSignal0 = channel0_stem.flat()
    let processedSignal1 = channel1_stem.flat()

    let channelLength = aud.src[0]
    let processedLength = processedSignal0.length

    processedSignal0 = insertZeros(processedSignal0, processedLength, channelLength, specParams)
    processedSignal1 = insertZeros(processedSignal1, processedLength, channelLength, specParams)

    // Generate buffer dic to create waveFile
    let bufferOutput = {
        numberOfChannels: 2,
        sampleRate: 44100,
        channelData: [processedSignal0, processedSignal1]
    }

    console.log("Generating wave file")
    return createWave(bufferOutput, "file.wav")
    
     
}


/**
 * Insert zeros in the beginning and end of signal
 * to recreate exactly the original song
 * @param signal
 * @param processedLength
 * @param originalLength
 * @param specParams
 */
function insertZeros(signal, processedLength, originalLength, specParams){
    let diff = processedLength - originalLength
    let padDiff = new Float32Array(specParams.fftLength + 208) // 208 magic number
    let padDiffEnd = new Float32Array(176) //176 is a magic number
    //Insert zeros in front of processed signal to be as exact size as the original one
    return signal = [...padDiff, ...signal, ...padDiffEnd]
}

/**
 *
 * @param path
 * @param resultSTFT
 * @param specParams
 * @returns {Promise<[][]>}
 */
async function loadAndPredict(path, resultSTFT, specParams){ //Update this
    // model load
    // const model = await tf.node.loadSavedModel(pb_path);
    
    let result = [[],[]]

    let number_of_frames = resultSTFT[0].shape[0]

    // //Fill with zeros
    if(number_of_frames < FRAMES){
        console.log("fill zeros", resultSTFT[0].shape[0])
        let fillZeros = FRAMES - number_of_frames
        let pad =tf.zeros([fillZeros,FREQUENCES], 'complex64')
        resultSTFT[0] = tf.concat([resultSTFT[0], pad])
        resultSTFT[1] = tf.concat([resultSTFT[1], pad])
    }
    //for(let i = 0; i < (number_of_frames - (number_of_frames % (FRAMES-PADDING))) ; i+=(FRAMES-PADDING)){
    //for(let i = 0; i < (number_of_frames - (number_of_frames % FRAMES)) ; i+= FRAMES){
    let input = createInput(resultSTFT[0], resultSTFT[1], 0)
    // prediction
    const output = tf.tidy(() => {
        return model.predict(input["model_input"]);
        // let paddedPredict = model.predict(input["model_input"]);
        // return paddedPredict.slice([(PADDING/2), 0, 0, 0],[(FRAMES-PADDING), 1, 2, FREQUENCES])
    })


    //Complex(output) * e^complex(input)

    // e^io = cos(theta)+i*sin(theta)

    let estimate = tf.mul(
        tf.complex(output, tf.zeros([FRAMES, N_BATCHES, N_CHANNELS, FREQUENCES])),
        tf.complex(tf.cos(input["mix_angle"]),tf.sin(input["mix_angle"]))
        //tf.exp(tf.complex(tf.zeros([FRAMES, N_BATCHES, N_CHANNELS, FREQUENCES]), input["mix_angle"]))
    )

    // TODO: background
    let estimat_f = tf.mul(
        tf.complex( (input["model_input"].sub(output)), tf.zeros([FRAMES, N_BATCHES, N_CHANNELS, FREQUENCES])),
        tf.complex(tf.cos(input["mix_angle"]),tf.sin(input["mix_angle"]))
        //tf.exp(tf.complex(tf.zeros([FRAMES, N_BATCHES, N_CHANNELS, FREQUENCES]), input["mix_angle"]))
    )

    let estimateReshapedR = tf.real(estimate)
    let estimateReshapedI = tf.imag(estimate)

    estimateReshapedR = estimateReshapedR.unstack(2).map(tensor => tensor.squeeze()) // Tensor[]
    estimateReshapedI = estimateReshapedI.unstack(2).map(tensor => tensor.squeeze()) // Tensor[]

    // Reshaping to separate channels and remove "batch" dimension, so we can compute the istft
    let estimateReshaped = []//estimate.unstack(2).map(tensor => tensor.squeeze()) // Tensor[]

    estimateReshaped[0] = tf.complex(estimateReshapedR[0], estimateReshapedI[0])
    estimateReshaped[1] = tf.complex(estimateReshapedR[1], estimateReshapedI[1])

    let res0 = postProcessing(estimateReshaped[0], specParams, 1.0)
    let res1 = postProcessing(estimateReshaped[1], specParams, 1.0)
    //

    // Push into result 2 channels
    result = [[...result[0],...res0], [...result[1],...res1]]

    //}

    return result;
}

/**
 *  A function that applies TF's STFT to a single Float32Array (a channel)
 * @param {*} channel
 * @param specParams
 * @returns A Float32Array that should be similar to the original channel
 */
function preProcessing(channel, specParams){
    let input = tf.tensor1d(channel, "float32");

    // Pad the signal for soft beginning
    input = padSignal(input, specParams, true); //multiple of 1024 (hop_size/frame_size?)

    // Perform stft
    let resultSTFT = tf.signal.stft(
        input,
        specParams.winLength,
        specParams.hopLength,
        specParams.fftLength
    );

    if (DEBUG) console.log("Shape after STFT: ", resultSTFT.shape)

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
    //TODO: review
    let pad = 2 * (specParams.fftLength - specParams.hopLength)
    pad = Math.floor(pad/2)
    //Insert padding
    if(forward){
        signal = tf.pad(signal, [[pad, pad]])
        if (DEBUG) console.log("[Preprocessing] Size after padding: " + signal.shape)
        return signal
    }else{
        signal = tf.slice(signal, [pad], [(signal.shape - 2 * pad)])
        if (DEBUG) console.log("[Postprocessing] Size after padding: " + signal.shape)
        return signal
    }

}


/**
 *
 * @param input
 * @param specParams
 * @param factor
 * @returns {Float32Array}
 */
function postProcessing(input, specParams, factor){
    let resultISTFT = istft(input, specParams, factor);
    if (DEBUG) console.log("Shape after ISTFT: ", resultISTFT.length)
    let signal = tf.tensor1d(resultISTFT)
    signal = padSignal(signal, specParams, false)

    // let resultMSE = mse(resultISTFT.slice(0, channel.length-1), channel);
    // console.log('Channel data sets are different by ' + resultMSE);

    return signal.arraySync()
}

/**
 * Creates input to the model
 * @param res0
 * @param res1
 * @param slice_start
 * @returns {{mix_angle: *, model_input: *}}
 */
function createInput(res0, res1, slice_start){
    let absChannel0 = tf.abs(res0).slice([slice_start,0], [FRAMES, FREQUENCES])
    let absChannel1 = tf.abs(res1).slice([slice_start,0], [FRAMES, FREQUENCES])
    const model_input = tf.stack([absChannel0, absChannel1]).transpose([1, 0, 2]).expandDims(1)

    //
    let chan0R = tf.real(res0).slice([slice_start,0], [FRAMES, FREQUENCES])
    let chan0I = tf.imag(res0).slice([slice_start,0], [FRAMES, FREQUENCES])

    let chan1R = tf.real(res1).slice([slice_start,0], [FRAMES, FREQUENCES])
    let chan1I = tf.imag(res1).slice([slice_start,0], [FRAMES, FREQUENCES])

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
    const hopLength = params.hopLength || Math.floor(winLength / 4);

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

    // Apply squared window
    let res = tf.mul(irfftTF, normalizationFactor).arraySync();

    // Overlap and add function (adds potentially overlapping frames of a signal)
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
    denom = tf.sum(denom, 0, true)
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

//https://stackoverflow.com/questions/29584420/how-to-manipulate-the-contents-of-an-audio-tag-and-create-derivative-audio-tags/30045041
// TODO change this cuz theres copyright problems :(
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


    //used by pure js
    //return buffer
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

// function saveFile (name, type, data) {
//     if (data != null && navigator.msSaveBlob)
//         return navigator.msSaveBlob(new Blob([data], { type: type }), name);
//     var a = document.createElement("a");
//     // document.body.appendChild(a);
//     a.style = "display: none";
//     var url = window.URL.createObjectURL(new Blob([data], {type: type}));
//     a.href = url;
//     a.download = name;
//     document.body.appendChild(a);
//     a.click();
//     window.URL.revokeObjectURL(url);
//     a.remove();
// }

export {readFile, modelProcess}

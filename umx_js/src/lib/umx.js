/* eslint-disable */
import * as tf from '@tensorflow/tfjs'

const FRAME_LENGTH = 2048
const HOP_LENGTH = 1024
const NFFT = 2048
const SAMPLE_RATE = 44100

// STFT and ISTFT params:
const specParams = {
    winLength: FRAME_LENGTH,
    hopLength: HOP_LENGTH,
    fftLength: NFFT
};

let ifftWindowTF = inverse_stft_window_fn(HOP_LENGTH,FRAME_LENGTH)

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


function modelProcess(){

    let preProcess0 = preProcessing(aud.src[0], specParams)
    let preProcess1 = preProcessing(aud.src[1], specParams)
 
    // model
    
    let postProcessing0 = postProcessing(preProcess0, specParams, 1.0)
    let postProcessing1 = postProcessing(preProcess1, specParams, 1.0)

    // Generate buffer dic to create waveFile
    let bufferOutput = {
        numberOfChannels: 2,
        sampleRate: 44100,
        channelData: [postProcessing0, postProcessing1]
    }
    return createWave(bufferOutput)
    
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
 * Pad the signal for song soft beginning
 * @param signal
 * @param specParams
 * @param forward insert or remove pad
 * @returns Float32Array with padded signal
 */
function padSignal(signal, specParams, forward){
    let pad = 2 * (specParams.fftLength - specParams.hopLength)
    pad = Math.floor(pad/2)
    //Insert padding
    if(forward){
        signal = tf.pad(signal, [[pad, pad]])
        return signal
    }else{
        signal = tf.slice(signal, [pad], [(signal.shape - pad)])
        return signal
    }

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
    input = padSignal(input, specParams, true);
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
 *
 * @param input
 * @param specParams
 * @param factor
 * @returns {Float32Array}
 */
function postProcessing(input, specParams, factor){
    let resultISTFT = istft(input, specParams, factor);
    let signal = tf.tensor1d(resultISTFT)
    signal = padSignal(signal, specParams, false)

    // let resultMSE = mse(resultISTFT.slice(0, channel.length-1), channel);
    // console.log('Channel data sets are different by ' + resultMSE);

    return signal.arraySync()
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
 * Return 2**N for integer N such that 2**N >= value.
 * @param value
 * @returns {number} smallest power of 2 enclosing
 */
function enclosingPowerOfTwo(value) {
    return Math.floor(Math.pow(2, Math.ceil(Math.log(value) / Math.log(2.0))));
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


//https://stackoverflow.com/questions/29584420/how-to-manipulate-the-contents-of-an-audio-tag-and-create-derivative-audio-tags/30045041
// TODO change this cuz theres copyright problems :(
// Convert a audio-buffer segment to a Blob using WAVE representation
function createWave(outputBuffer) {
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

export {readFile, modelProcess}

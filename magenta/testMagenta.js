/**
 * Test file for STFT and ISTFT using @magenta/music
 */

// const magenta = require('@magenta/music/node');
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const mse = require('mse');
const FFT = require('fft.js');
const wv = require('wavefile');
const decode = require('audio-decode');

const FRAME_LENGTH = 4096
const HOP_LENGTH = 1024
const SAMPLE_RATE = 44100
const PATCH_LENGTH = 512
let SAMPLE_LENGTH //64000
// ISTT params:
const ispecParams = {
    //nFFt: FRAME_LENGTH,
    winLength: FRAME_LENGTH,
    hopLength: HOP_LENGTH,
    sampleRate: SAMPLE_RATE,
    center: true,
};

// const input = [1, 1, 1, 1, 1]
// let result = preprocessing(input)
// console.log(result)


let arrayBuffer = fs.readFileSync("audio_example.mp3");
decodeFile(arrayBuffer);

let channel0 = readFile('channel0');
let channel1 = readFile('channel1');

SAMPLE_LENGTH = channel0.length
console.log("\n------------------- Test with KoeKestra's Data ---------------------------\n")
console.log("\nProcessing channel 0\n")
const result0 = preprocessing(channel0)
console.log("\nProcessing channel 1\n")
const result1 = preprocessing(channel1)


let output = new Float32Array(result0, result1)
let wav = new wv.WaveFile();
wav.fromScratch(2, 22050, '32f',
    output);

fs.writeFileSync('testKoekestra.wav', wav.toBuffer()); 


/**
 *  A function that applies TF's STFT and Magenta's ISTFT to a single Float32Array (a channel)
 * @param {*} channel
 * @returns A Float32Array that should be similar to the original channel
 */
function preprocessing(channel){
    console.log("Shape of input: " + channel.length)
    
    const input = tf.tensor1d(channel, 'float32') // Here there's a bug that makes the array lose precision
    let resultSTFT = tf.signal.stft(input, FRAME_LENGTH, HOP_LENGTH);
    console.log("Shape after STFT: ", resultSTFT.shape)
    
    let reImArray = interleaveReIm(tf.real(resultSTFT), tf.imag(resultSTFT))
    console.log("Shape after interleave: ", reImArray.length, reImArray[0].length)
    //console.log("ReIMArray:" + reImArray)
    let resultISTFT = istft(reImArray, ispecParams);
    console.log("Shape after ISTFT: ", resultISTFT.length)

    let resultMSE = mse(resultISTFT.slice(0, channel.length-1), channel);
    console.log('Channel data sets are different by ' + resultMSE);

    return resultISTFT
}

/**
 *
 * @param arrayBuffer
 */
function decodeFile(arrayBuffer) {
    decode(arrayBuffer, (err, audioBuffer) => {
        try {

            let channel0 = audioBuffer._channelData[0];
            let channel1 = audioBuffer._channelData[1];
            console.log("\n------------------- Test with WavDecoder's Data ---------------------------\n")
            console.log("\nProcessing channel 0\n")
            const result0 = preprocessing(channel0)
            console.log("\nProcessing channel 1\n")
            const result1 = preprocessing(channel1)

            let output = new Float32Array(channel0, channel1)

            let wav = new wv.WaveFile();
            wav.fromScratch(2, 22050, '32f',
                audioBuffer._channelData);

            fs.writeFileSync('testWavDecoder.wav', wav.toBuffer());

        } catch (e) {
            console.log(e)
            throw e;
        }
    });
}


/**
 *
 * @param file
 * @returns Float32Array with the values from file
 */
function readFile(file) {
    let arrayBuffer = fs.readFileSync(file).toString('utf-8');
    let textByLine = arrayBuffer.split(" ");

    let floatArray = new Float32Array(textByLine.length - 1) // -1 cuz the last value is NaN

    let stringToFloatArray = textByLine.map(function(c) {
        return parseFloat(c).toPrecision(16);
    });

    stringToFloatArray = stringToFloatArray.slice(0, -1); // Remove the last element NaN

    floatArray = stringToFloatArray;

    return floatArray;
}

function hannWindow(length) {
    const win = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (length - 1)));
    }
    return win;
}

// function padConstant(data: Float32Array, padding: number|number[]) {
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

//export function padCenterToLength(data: Float32Array, length: number) {
function padCenterToLength(data, length) {
    // If data is longer than length, error!
    if (data.length > length) {
        console.log(data.length, length)
        throw new Error('Data is longer than length.');
    }

    const paddingLeft = Math.floor((length - data.length) / 2);
    const paddingRight = length - data.length - paddingLeft;
    return padConstant(data, [paddingLeft, paddingRight]);
}


// export function applyWindow(buffer: Float32Array, win: Float32Array) {
function applyWindow(buffer, win) {
    //if(win.length === 1025) win = win.slice(0, -1);
    // if(win.length === 2049) win = win.slice(0, -1);
    if (buffer.length !== win.length) {
        throw new Error(`Buffer length ${buffer.length} != window length ${win.length}.`);
    }

    const out = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        out[i] = win[i] * buffer[i];
    }
    return out;
}

// export function ifft(reIm: Float32Array): Float32Array {
function ifft(reIm) {
    // Interleave.
    var nFFT = reIm.length / 2;
    
    const fft = new FFT(nFFT);
    const recon = fft.createComplexArray();
    fft.inverseTransform(recon, reIm);
    // Just take the real part.
    const result = fft.fromComplexArray(recon);
    return result;
}

//function istft(reIm: Float32Array[], params: InverseSpecParams): Float32Array {
/**
 *
 * @param reIm
 * @param params Parameters for computing a inverse spectrogram from audio.
 *
   params {
    sampleRate: number;
    hopLength?: number;
    winLength?: number;
    nFft?: number;
    center?: boolean;
   }
 * @returns {Float32Array}
 */
function istft(reIm, params) {
    const nFrames = reIm.length;
    const nReIm = reIm[0].length;
    const nFft = params.nFFT || (nReIm / 2);
    const winLength = params.winLength || nFft;
    const hopLength = params.hopLength || Math.floor(winLength / 4);
    const center = params.center || false;

    let ifftWindow = hannWindow(winLength);
    // Adjust normalization for 75% Hann cola (factor of 1.5 with stft/istft).
    for (let i = 0; i < ifftWindow.length; i++) {
        ifftWindow[i] = ifftWindow[i] / 1.5;
    }

    // Pad the window to be the size of nFft. Only if nFft != winLength.
    ifftWindow = padCenterToLength(ifftWindow, nFft);// nFft

    // Pre-allocate the audio output.
    const expectedSignalLen = nFft + hopLength * (nFrames - 1);
    const y = new Float32Array(expectedSignalLen);
    //console.log("expected signal length: " + expectedSignalLen, " Sample len: " + SAMPLE_LENGTH)

    // Perform inverse ffts.
    for (let i = 0; i < nFrames; i++) {
        const sample = i * hopLength;
        //console.log("IFFT input len: ", reIm[i].length)
        let yTmp = ifft(reIm[i]);
        //console.log("IFFT output len: ", yTmp.length)

        yTmp = applyWindow(yTmp, ifftWindow);
        yTmp = add(yTmp, y.slice(sample, sample + nFft));
        y.set(yTmp, sample);
    }

    let sliceStart = 0;
    let sliceLength = expectedSignalLen;
    if (center) {
        // Normally you would center the outputs,
        sliceStart = nFft / 2;
        sliceLength = y.length - (nFft / 2);
    } else {
        // For gansynth, we did all the padding at the front instead of centering,
        // so remove the padding at the front.
        sliceStart = expectedSignalLen - SAMPLE_LENGTH; // TODO: Figure out what this is 
        sliceLength = y.length - sliceStart;
    }
    const yTrimmed = y.slice(sliceStart, sliceLength);
    return yTrimmed;
}

//function add(arr0: Float32Array, arr1: Float32Array) {
function add(arr0, arr1) {
    // if(arr1.length == 1025) arr1 = arr1.slice(0, -1);
    // if(arr1.length == 2049) arr1 = arr1.slice(0, -1);
    if (arr0.length !== arr1.length) {
        console.error(
            `Array lengths must be equal to add: ${arr0.length}, ${arr0.length}`);
        return null;
    }

    const out = new Float32Array(arr0.length);
    for (let i = 0; i < arr0.length; i++) {
        out[i] = arr0[i] + arr1[i];
    }
    return out;
}

/**
 * Interleave real and imaginary tensor values [re0, im0, re1, im1...]
 * @param real
 * @param imag
 * @returns {Float32Array[]}
 */
function interleaveReIm(real, imag) {
    console.log(real.shape, imag.shape)
    const mirrorReal = tf.reverse(real.slice([0, 0], [real.shape[0], FRAME_LENGTH / 2 - 1]), 1);
    real = tf.concat([real, mirrorReal], 1);

    const mirrorImag = tf.reverse(imag.slice([0, 0], [imag.shape[0], FRAME_LENGTH / 2 - 1]), 1);
    imag = tf.concat([imag, tf.mul(mirrorImag, -1.0)], 1);

    let realArray = real.arraySync();
    let imagArray = imag.arraySync();

    const resInterleaved = new Array();

    for(let i = 0; i < realArray.length - 1; i++){
        const frame = new Float32Array( (FRAME_LENGTH * 2)); // TODO: Check if this is correct (should it be -1)
        //if (i < realArray.length - 1) {
            for(let j = 0; j < FRAME_LENGTH; j++){
                frame[j*2+0] = realArray[i][j]; //Real
                frame[j*2+1] = imagArray[i][j]; //Im

            }
        //}
        resInterleaved.push(frame)
    }

    return resInterleaved
}

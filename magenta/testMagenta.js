/**
 * Test file for STFT and ISTFT using @magenta/music
 */

const magenta = require('@magenta/music/node/core');
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const mse = require('mse');
const FFT = require('fft.js');
const WaveFile = require('wavefile');

const FRAME_LENGTH = 4096
const FRAME_STEP = 1024

let channel0 = readFile('channel0');

// inverse spec params:
const ispecParams = {
    nFFt: 2048,
    // winLength: 2048,
    // hopLength: 512,
    sampleRate: 44100,
    // sampleRate: 44100,
    // center: false,
};

// stft params
let stft_params = {
    // hopLength: FRAME_STEP,
    sampleRate: 44100,
    // winLength: FRAME_LENGTH
}

//Calculate the STFT
let calcStft = stft(channel0, stft_params);

// console.log(calcStft.length, calcStft[0].length)


//Calculate the ISTFT
let calcISTFT = istft(calcStft, ispecParams);


//Calculate MSE
let result = mse(calcISTFT, channel0);
if (result !== 0) {
    console.log('data sets are different by ' + result);
}


//Create WaveFileAgain
// let wav = new WaveFile();
// wav.fromScratch(1, 44100, '32f',
//     calcISTFT);

// fs.writeFileSync('tst.wav', wav.toBuffer());

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
        throw new Error('Data is longer than length.');
    }

    const paddingLeft = Math.floor((length - data.length) / 2);
    const paddingRight = length - data.length - paddingLeft;
    return padConstant(data, [paddingLeft, paddingRight]);
}

// function padReflect(data: Float32Array, padding: number) {
function padReflect(data, padding) {
    const out = padConstant(data, padding);
    for (let i = 0; i < padding; i++) {
        // Pad the beginning with reflected values.
        out[i] = out[2 * padding - i];
        // Pad the end with reflected values.
        out[out.length - i - 1] = out[out.length - 2 * padding + i - 1];
    }
    return out;
}

/**
 * Given a timeseries, returns an array of timeseries that are windowed
 * according to the params specified.
 */
//function frame(data: Float32Array, frameLength: number, hopLength: number): Float32Array[] {
function frame(data, frameLength, hopLength) {
    const bufferCount = Math.floor((data.length - frameLength) / hopLength) + 1;
    const buffers = Array.from({length: bufferCount}, (x, i) => new Float32Array(frameLength));
    for (let i = 0; i < bufferCount; i++) {
        const ind = i * hopLength;
        const buffer = data.slice(ind, ind + frameLength);
        buffers[i].set(buffer);
        // In the end, we will likely have an incomplete buffer, which we should
        // just ignore.
        if (buffer.length !== frameLength) {
            continue;
        }
    }
    return buffers;
}

// function fft(y: Float32Array) {
function fft(y) {
    const fft = new FFT(y.length);
    const out = fft.createComplexArray();
    const data = fft.toComplexArray(y);
    fft.transform(out, data);
    return out;
}

// export function applyWindow(buffer: Float32Array, win: Float32Array) {
function applyWindow(buffer, win) {
    if(win.length === 1025) win = win.slice(0, -1);
    if (buffer.length !== win.length) {
        throw new Error(`Buffer length ${buffer.length} != window length ${win.length}.`);
    }

    const out = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        out[i] = win[i] * buffer[i];
    }
    return out;
}


//function stft(y: Float32Array, params: SpecParams): Float32Array[] {
/**
 *
 * @param y
 * @param params
 *
  sampleRate: number;
  hopLength?: number;
  winLength?: number;
  nFft?: number;
  nMels?: number;
  power?: number;
  fMin?: number;
  fMax?: number;
 * @returns {[]}
 */
function stft(y, params) {
    const nFft = params.nFft || 2048;
    const winLength = params.winLength || nFft;
    const hopLength = params.hopLength || Math.floor(winLength / 4);

    let fftWindow = hannWindow(winLength);

    // Pad the window to be the size of nFft.
    fftWindow = padCenterToLength(fftWindow, nFft);

    // Pad the time series so that the frames are centered.
    y = padReflect(y, Math.floor(nFft / 2));

    // Window the time series.
    const yFrames = frame(y, nFft, hopLength);
    // Pre-allocate the STFT matrix.
    const stftMatrix = [];

    const width = yFrames.length;
    const height = nFft + 2;
    for (let i = 0; i < width; i++) {
        // Each column is a Float32Array of size height.
        const col = new Float32Array(height);
        stftMatrix[i] = col;
    }

    for (let i = 0; i < width; i++) {
        // Populate the STFT matrix.
        const winBuffer = applyWindow(yFrames[i], fftWindow);
        const col = fft(winBuffer);
        stftMatrix[i].set(col.slice(0, height));
    }

    return stftMatrix;
}

// export function ifft(reIm: Float32Array): Float32Array {
function ifft(reIm) {
    // Interleave.
    var nFFT = reIm.length / 2;
    if(nFFT == 1025) nFFT = 1024
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
    const nFft = (nReIm / 2);
    const winLength = params.winLength || nFft;
    const hopLength = params.hopLength || Math.floor(winLength / 4);
    const center = params.center || false;

    let ifftWindow = hannWindow(winLength);
    // Adjust normalization for 75% Hann cola (factor of 1.5 with stft/istft).
    for (let i = 0; i < ifftWindow.length; i++) {
        ifftWindow[i] = ifftWindow[i] / 1.5;
    }

    // Pad the window to be the size of nFft. Only if nFft != winLength.
    ifftWindow = padCenterToLength(ifftWindow, nFft);

    // Pre-allocate the audio output.
    const expectedSignalLen = nFft + hopLength * (nFrames - 1);
    const y = new Float32Array(expectedSignalLen);

    // Perform inverse ffts.
    for (let i = 0; i < nFrames; i++) {
        const sample = i * hopLength;
        let yTmp = ifft(reIm[i]);
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
        sliceStart = 3072//expectedSignalLen - 64000//SAMPLE_LENGTH;  // 3072 //TODO check this
        sliceLength = y.length - sliceStart;
    }
    const yTrimmed = y.slice(sliceStart, sliceLength);
    return yTrimmed;
}

//function add(arr0: Float32Array, arr1: Float32Array) {
function add(arr0, arr1) {
    if(arr1.length == 1025) arr1 = arr1.slice(0, -1);
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

// function interleaveReIm(real: tf.Tensor, imag: tf.Tensor) {
function interleaveReIm(real, imag) {
    const reImInterleave = tf.tidy(() => {
        // Combine and add back in the zero DC component
        let reImBatch = tf.concat([real, imag], 0).expandDims(3);
        reImBatch = tf.pad(reImBatch, [[0, 0], [0, 0], [1, 0], [0, 0]]);

        // Interleave real and imaginary for javascript ISTFT.
        // Hack to interleave [re0, im0, re1, im1, ...] with batchToSpace.
        const crops = [[0, 0], [0, 0]];
        const reImInterleave =
            tf.batchToSpaceND(reImBatch, [1, 2], crops).reshape([128, 4096]);
        // Convert Tensor to a Float32Array[]
        return reImInterleave;
    });
    const reImArray = reImInterleave.dataSync();
    const reIm = [];
    for (let i = 0; i < 128; i++) {
        reIm[i] = reImArray.slice(i * 4096, (i + 1) * 4096);
    }
    reImInterleave.dispose();
    return reIm;
}

// async function reImToAudio(reIm: Float32Array[]) {
async function reImToAudio(reIm) {
    const ispecParams = {
        nFFt: 2048,
        winLength: 2048,
        hopLength: 512,
        sampleRate: 16000,
        center: false,
    };
    return istft(reIm, ispecParams);
}

/**
 * Test file for STFT and ISTFT using @magenta/music
 */

// const magenta = require('@magenta/music/node/core');
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const mse = require('mse');
const FFT = require('fft.js');
const WaveFile = require('wavefile');

const FRAME_LENGTH = 4096
const HOP_LENGTH = 1024
const SAMPLE_RATE = 44100
const NUMBER_OF_CHANNELS = 2

let channel0 = readFile('channel0');
let channel1 = readFile('channel1');

// inverse spec params:
const ispecParams = {
    nFFt: 4096,
    // winLength: 2048, //2048
    hopLength: HOP_LENGTH,
    sampleRate: SAMPLE_RATE,
    center: true,
};

// stft params
let stft_params = {
    nFft: 4096,
    // winLength: 2048,
    hopLength: HOP_LENGTH,
    sampleRate: SAMPLE_RATE
}

//Calculate the STFT for both channels
let calcStft0 = stft(channel0, stft_params);
let calcStft1 = stft(channel1, stft_params);

//Calculate the ISTFT for both channels
let calcISTFT0 = istft(calcStft0, ispecParams);
let calcISTFT1 = istft(calcStft1, ispecParams);


//Calculate MSE
let result0 = mse(calcISTFT0, channel0);
let result1 = mse(calcISTFT1, channel1);
if (result0 !== 0 || result1 !== 0) {
    console.log('Channel 0 data sets are different by ' + result0);
    console.log('Channel 1 data sets are different by ' + result1);
}

//Resample music
let audio = new Float32Array(calcISTFT0, calcISTFT1)

// Create WaveFileAgain
let wav = new WaveFile();
wav.fromScratch(2, 44100, '32f',
    audio);

fs.writeFileSync('tst.wav', wav.toBuffer());

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
    if(win.length === 2049) win = win.slice(0, -1);
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

    // console.log(fftWindow);
    // console.log(nFft);

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
    if(nFFT == 2049) nFFT = 2048
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
    ifftWindow = padCenterToLength(ifftWindow, nFft);// nFft

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
        sliceStart = expectedSignalLen - 64000; // 3072 // TODO 64000 come from magenta constants
        sliceLength = y.length - sliceStart;
    }
    const yTrimmed = y.slice(sliceStart, sliceLength);
    return yTrimmed;
}

//function add(arr0: Float32Array, arr1: Float32Array) {
function add(arr0, arr1) {
    if(arr1.length == 1025) arr1 = arr1.slice(0, -1);
    if(arr1.length == 2049) arr1 = arr1.slice(0, -1);
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

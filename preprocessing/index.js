/**
 * Test file for STFT and ISTFT using tfjs and magenta/music
 */
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const mse = require('mse');
const wv = require('wavefile');
const decode = require('audio-decode');

const FRAME_LENGTH = 4096
const HOP_LENGTH = 1024
const SAMPLE_RATE = 44100
const PATCH_LENGTH = 512

const path = './vocals'

// ISTT params:
const ispecParams = {
    winLength: FRAME_LENGTH,
    hopLength: HOP_LENGTH,
};

//let arrayBuffer = fs.readFileSync("audio_example.mp3");
//decodeFile(arrayBuffer);

let channel0 = readFile('channel0');
let channel1 = readFile('channel1');

console.log("\n------------------- Test with KoeKestra's Data ---------------------------\n")
console.log("\nProcessing channel 0\n")
const result0 = preprocessing(channel0)
console.log("\nProcessing channel 1\n")
const result1 = preprocessing(channel1)

/*
inputs: {
      audio_id: [Object],
      mix_spectrogram: [Object],
      mix_stft: [Object],
      waveform: [Object]
    }
*/
let modelInput = createInput(result0, result1, [channel0, channel1])

load(path)

async function load(path){
// model load
    const model = await tf.node.loadSavedModel(path);

// prediction
    const output = model.predict(modelInput[0]);

    output.print(true)

    let mix_stft = modelInput[1]
    // let model_output = umx(tf.abs(mix_stft))
    let mix_angle = tf.atan2(tf.imag(mix_stft), tf.real(mix_stft))

    let tensor4d = tf.tensor4d([0], [100, 1, 2, 2049], 'float32')

    let estimate = tf.mul(tf.complex(output, tensor4d), tf.exp(tf.complex(0.0, mix_angle))).print(true)

    exit()
    // output = ISTFT(estimate, ...)
    //
    // output.print(true)
    // console.log(output)
}

let wav = new wv.WaveFile();


let output = new Float32Array(result0, result1)

wav.fromScratch(2, 22050, '32f',
    output);

fs.writeFileSync('testKoekestra.wav', wav.toBuffer());


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

            let output = new Float32Array(result0, result1)

            let wav = new wv.WaveFile();
            wav.fromScratch(2, SAMPLE_RATE, '32f',
            output);

            fs.writeFileSync('testWavDecoder.wav', wav.toBuffer());

        } catch (e) {
            console.log(e)
            throw e;
        }
    });
}

/*--------------------- Process Functions ------------------------------------------------------------------------------------------------------*/

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

    return resultSTFT

    // let reImArray = interleaveReIm(tf.real(resultSTFT), tf.imag(resultSTFT))
    // console.log("Shape after interleave: ", reImArray.length, reImArray[0].length)


    // let magPhaseArray = magnitudeAndPhaseDecomposition(reImArray)
    // console.log("magnitude len:", magPhaseArray[0].length, magPhaseArray[0][0].length, "phase len:", magPhaseArray[1].length,magPhaseArray[1][0].length)

    // return [magPhaseArray, resultSTFT]
}

function postprocessing(reImArray){
    let resultISTFT = istft(reImArray, ispecParams);
    console.log("Shape after ISTFT: ", resultISTFT.length)

    let resultMSE = mse(resultISTFT.slice(0, channel.length-1), channel);
    console.log('Channel data sets are different by ' + resultMSE);

    return resultISTFT
}

// From Koekestra
function magnitudeAndPhaseDecomposition(reImArray){
    const mag   = [];
    const phase = [];
    let res = []
    for (var frame = 0; frame < reImArray.length; frame++) {
        const fmag   = new Float32Array(FRAME_LENGTH / 2 + 1);
        const fphase = new Float32Array(FRAME_LENGTH / 2 + 1);
        for (var i = 0; i < FRAME_LENGTH / 2 + 1; i++) {
            fmag  [i] = Math.sqrt(Math.pow(reImArray[frame][i*2+1], 2) + Math.pow(reImArray[frame][i*2+0], 2));
            fphase[i] = Math.atan2(reImArray[frame][i*2+1], reImArray[frame][i*2+0]);
        }
        mag  .push(fmag);
        phase.push(fphase);
    }

    res.push(mag)
    res.push(phase)
    return res
}


/*
inputs: {
      audio_id: [Object],
      mix_spectrogram: [Object],
      mix_stft: [Object],
      waveform: [Object]
    }
*/
function createInput(res0, res1, channels){
    // const magArray0 = res0[0][0]
    // const magArray1 = res1[0][0]
    //
    // const INF_FREQ = FRAME_LENGTH / 4;
    // const PATCH_SIZE = 1 * PATCH_LENGTH * INF_FREQ * 2;
    // const spectogram = new Float32Array(PATCH_SIZE);
    //
    // for (var i = 0; i < INF_FREQ; i++) {
    //     for (var j = 0; j < PATCH_LENGTH; j++) {
    //         const xi = (j * INF_FREQ + i) * 2;
    //         spectogram[xi + 0] = magArray0[j][i];
    //         spectogram[xi + 1] = magArray1[j][i];
    //     }
    // }
    //
    // const mix_stft = tf.stack([res0[1], res1[1]]).transpose([1,2,0])
    // console.log("mix_stft",mix_stft.shape)
    //
    // const shape =  [1, PATCH_LENGTH, INF_FREQ, 2];
    // const mix_spectrogram =  tf.tensor(spectogram, shape)
    // console.log("mix_spectrogram",mix_spectrogram.shape)
    //
    //
    //
    // const waveform = tf.input({shape: [2]});
    // //console.log("waveform", waveform)
    //
    // const audio_id = tf.tensor("");
    //
    // return {"Placeholder_1": audio_id,"strided_slice_3":mix_spectrogram, "transpose_1": mix_stft, "Placeholder":waveform}

    //Ugly things just to test
    let absChannel0 = tf.abs(res0).slice([300,0], [100,2049])
    let absChannel1 = tf.abs(res1).slice([300,0], [100,2049])

    const mix_stft = tf.stack([absChannel0, absChannel1]).transpose([1, 0, 2])

    return [mix_stft.expandDims(1), res0, res1];


    //const tst = tf.
    // let absChannel1 = tf.abs(res1).gather(0)


    //
    // const input = tf.tensor1d(channels[0], 'float32').arraySync().slice(0, 100)
    //
    // const batch = tf.tensor4d([1, 1, 1, 1], [100, 1, 2, 2049]).print(true)
    //
    // exit()
    //
    // const retVal = tf.tensor4d([input, batch, mix_stft]).print(true)
    //
    // exit()
    // retVal.print(true)
    //
    // exit()
    // return retVal

}

/**
 * modelInput
 * shape [100, 1, 2, 2049]
 * 100 = frames
 * 1 = sample/batch
 * 2 = channels
 * 2049 = frequencies
 * @param modelInput
 * @returns {Promise<void>}
 */
async function loadModel(modelInput) {
    // model load
    const model = await tf.node.loadSavedModel(path);

    // prediction
    const output = model.predict(modelInput);
    console.log(output)
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
    if (buffer.length !== win.length) {
        throw new Error(`Buffer length ${buffer.length} != window length ${win.length}.`);
    }

    const out = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        out[i] = win[i] * buffer[i];
    }
    return out;
}

/**
 *
 * @param complex is the output of STFT
 * @param params Parameters for computing a inverse spectrogram from audio.
 *
 params {
    hopLength?: number;
    winLength?: number;
    nFft?: number;
   }
 * @returns {Float32Array}
 */
function istft(complex, params) {
    const nFrames = complex.shape[0];
    const nFft = params.nFft || enclosingPowerOfTwo(complex.shape[1]);
    const winLength = params.winLength || nFft;
    const hopLength = params.hopLength || Math.floor(winLength / 4);

    let ifftWindowTF = tf.hannWindow(winLength);
    let ifftWindow = ifftWindowTF.arraySync();
    // Adjust normalization for 75% Hann cola (factor of 1.5 with stft/istft).
    for (let i = 0; i < ifftWindow.length; i++) {
        ifftWindow[i] = ifftWindow[i] / 1.5;
    }

    // Pad the window to be the size of nFft. Only if nFft != winLength.
    ifftWindow = padCenterToLength(ifftWindow, nFft);// nFft

    // Pre-allocate the audio output.
    const expectedSignalLen = nFft + hopLength * (nFrames - 1);
    const istftResult = new Float32Array(expectedSignalLen);
    // console.log("expected signal length: " + expectedSignalLen, " Sample len: " + SAMPLE_LENGTH)

    // Perform inverse ffts and extract it from tensor as an array
    let irfft = complex.irfft().arraySync()

    // Apply Window to inverse ffts
    for(let i = 0; i < complex.shape[0] - 1; i++){
        const sample = i * hopLength;
        let yTmp = irfft[i];
        yTmp = applyWindow(yTmp, ifftWindow);
        yTmp = add(yTmp, istftResult.slice(sample, sample + nFft));
        istftResult.set(yTmp, sample);
    }
    return istftResult
}

function enclosingPowerOfTwo(value) {
    // Return 2**N for integer N such that 2**N >= value.
    return Math.floor(Math.pow(2, Math.ceil(Math.log(value) / Math.log(2.0))));
}

function add(arr0, arr1) {
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

    for(let i = 0; i < PATCH_LENGTH/*realArray.length - 1*/; i++){
        const frame = new Float32Array( (FRAME_LENGTH * 2)); // TODO: Check if this is correct (should it be -1)
         if (i < realArray.length - 1) {
            for(let j = 0; j < FRAME_LENGTH; j++){
                frame[j*2+0] = realArray[i][j]; //Real
                frame[j*2+1] = imagArray[i][j]; //Im

            }
        }
        resInterleaved.push(frame)
    }

    // let resInterLeavedTF = tf.tensor2d(resInterleaved);
    // let addPad = tf.pad(resInterLeavedTF, [[1,0], [0,0]])

    return resInterleaved
}

/**
 * Test file for STFT and ISTFT using tfjs and magenta/music
 */
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const mse = require('mse');
const wv = require('wavefile');
const decode = require('audio-decode');

const Lame = require("node-lame").Lame;
const {Howl, Howler} = require('howler');

const FRAME_LENGTH = 4096
const HOP_LENGTH = 1024
const SAMPLE_RATE = 44100
const PATCH_LENGTH = 512

const FREQUENCES = 2049
const FRAMES = 100
const N_CHANNELS = 2
const N_BATCHES = 1

const path = "http://localhost:5000/vocals-tfjs-unilstm/model.json"
const pb_path = "../model"
const AUDIO_PATH = "../data/audio_example.mp3"

// ISTT params:
const ispecParams = {
    winLength: FRAME_LENGTH,
    hopLength: HOP_LENGTH,
};

decodeFile(AUDIO_PATH);

return

let channel0 = readFile('../data/channel0');
let channel1 = readFile('../data/channel1');

console.log("\nProcessing channel 0\n")
const result0 = preprocessing(channel0)
console.log("\nProcessing channel 1\n")
const result1 = preprocessing(channel1)

loadAndPredict(path, [result0, result1]).then(arr =>
    {
        let wav = new wv.WaveFile();

        let output = new Float32Array(arr[0], arr[1])

        wav.fromScratch(2, 22050, '32f',
            output);

        fs.writeFileSync('vocal.wav', wav.toBuffer());}
    ).catch(e => console.log(e))


/*--------------------- Functions ------------------------------------------------------------------------------------------------------*/

/**
 *
 * @param outputPath
 * @param channels
 * @param nbChannels
 * @param sampleRate
 * @param bitDepthCode
 */
function compileSong(outputPath, channels, nbChannels, sampleRate, bitDepthCode){
    let wav = new wv.WaveFile();

    let output = new Float32Array(channels[0], channels[1])

    wav.fromScratch(nbChannels, sampleRate, bitDepthCode, output);

    fs.writeFileSync(outputPath, wav.toBuffer());
}

/**
 *
 * @param path
 */
function decodeFile(path){
    const decoder = new Lame({
        output: "buffer",
        bitrate: 192,
    }).setFile(path);

    decoder
        .decode()
        .then(() => {
            const buffer = decoder.getBuffer();
            decodeFromBuffer(buffer)
        })
        .catch(error => {
            console.log(error)
        });
}


/**
 *
 * @param buffer
 */
function decodeFromBuffer(buffer){ //TODO separate this
    decode(buffer, (err, audioBuffer) => {
        const result0 = preprocessing(audioBuffer._channelData[0]);
        const result1 = preprocessing(audioBuffer._channelData[1]);
        loadAndPredict(path, [result0, result1]).then(arr => {
            compileSong('tst.wav', [arr[0], arr[1]], 2, 22050, '32f')
        });
    });
}


/**
 *
 * @param path
 * @param resultSTFT
 * @returns {Promise<[][]>}
 */
async function loadAndPredict(path, resultSTFT){

    // model load
    const model = await tf.node.loadSavedModel(pb_path);
    //const model = await tf.loadGraphModel(path);

    let result = [[],[]]

    let number_of_frames = resultSTFT[0].shape[0]

    for(let i = 0; i < (number_of_frames - (number_of_frames % FRAMES)) ; i+= FRAMES){
        let input = createInput(resultSTFT[0], resultSTFT[1], i)
        // prediction
        const output = model.predict(input["model_input"]);
        //const output = await model.predict(input["model_input"]);

        let estimate = tf.mul(tf.complex(output, tf.zeros([FRAMES, N_BATCHES, N_CHANNELS, FREQUENCES])),
                              tf.exp(tf.complex(tf.zeros([FRAMES, N_BATCHES, N_CHANNELS, FREQUENCES]), input["mix_angle"])))

        // Reshaping to separate channels and remove "batch" dimension, so we can compute the istft
        let estimateReshaped = estimate.unstack(2).map(tensor => tensor.squeeze()) // Tensor[]

        let res0 = istft(estimateReshaped[0], ispecParams)
        let res1 = istft(estimateReshaped[1], ispecParams)

        result = [[...result[0],...res0], [...result[1],...res1]]

        estimate.dispose()
        input["mix_angle"].dispose()
        input["model_input"].dispose()
    }


    return result
}


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

}

/**
 *
 * @param reImArray
 * @returns {Float32Array}
 */
function postprocessing(reImArray){
    let resultISTFT = istft(reImArray, ispecParams);
    console.log("Shape after ISTFT: ", resultISTFT.length)

    let resultMSE = mse(resultISTFT.slice(0, channel.length-1), channel);
    console.log('Channel data sets are different by ' + resultMSE);

    return resultISTFT
}


function createInput(res0, res1, slice_start){

    let absChannel0 = tf.abs(res0).slice([slice_start,0], [FRAMES, FREQUENCES])
    let absChannel1 = tf.abs(res1).slice([slice_start,0], [FRAMES, FREQUENCES])
    const model_input = tf.stack([absChannel0, absChannel1]).transpose([1, 0, 2]).expandDims(1)

    let chan0 = res0.slice([slice_start,0], [FRAMES, FREQUENCES])
    let chan1 = res1.slice([slice_start,0], [FRAMES, FREQUENCES])
    const mix_stft = tf.stack([chan0, chan1]).transpose([1, 0, 2]).expandDims(1)

    let mix_angle = tf.atan2(tf.imag(mix_stft), tf.real(mix_stft))

    return {"model_input":model_input, "mix_angle":mix_angle}

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

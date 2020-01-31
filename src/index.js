/**
 * Test file for STFT and ISTFT using tfjs and magenta/music
 */
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const mse = require('mse');
const wv = require('wavefile');
const decode = require('audio-decode');
const Lame = require("node-lame").Lame;

const FRAME_LENGTH = 4096
const HOP_LENGTH = 1024
const SAMPLE_RATE = 22050
const PATCH_LENGTH = 512

const FREQUENCES = 2049
const FRAMES = 100
const N_CHANNELS = 2
const N_BATCHES = 1
const PADDING = 10 // Padding for model prediction

const path = "http://localhost:5000/vocals-tfjs-unilstm/model.json"
const pb_path = "../model"
const AUDIO_PATH = "../data/audio_example.mp3"
// const AUDIO_PATH = "../data/Shallow_CUT.mp3"
//const AUDIO_PATH = "../data/Shallow_Lady_Gaga.mp3"

// STFT and ISTFT params:
const ispecParams = {
    winLength: FRAME_LENGTH,
    hopLength: HOP_LENGTH,
};


tf.enableProdMode()

let counterChunk = 0;

// decodeFile(AUDIO_PATH);

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
async function decodeFile(path){
    const decoder = new Lame({
        output: "buffer",
        bitrate: 192,
    }).setFile(path);

    return decoder
        .decode()
        .then(() => {
            const buffer = decoder.getBuffer();
            return buffer
            // decodeFromBuffer(buffer)
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

        console.log(audioBuffer.length)
        const numPatches = Math.floor(Math.floor((audioBuffer.length - 1) / HOP_LENGTH) / PATCH_LENGTH) + 1;

        console.log(numPatches)
        // console.log(numPatches,(numPatches * PATCH_LENGTH * HOP_LENGTH), PATCH_LENGTH * HOP_LENGTH)
        let start = 0

        let channel0_stem = [];
        let channel1_stem = [];

        let chunk = Math.floor(audioBuffer.length / numPatches)
        let end = chunk
        for (let i = 0; i < numPatches; i++) {
            console.log("Start processing chunk: "+i)
            const result0 = preProcessing(audioBuffer._channelData[0].slice(start, end));
            const result1 = preProcessing(audioBuffer._channelData[1].slice(start, end));
            loadAndPredict(path, [result0, result1])
                .then(arr => {

                channel0_stem[i] = arr[0];
                channel1_stem[i] = arr[1];

                if(counterChunk === numPatches - 1){
                    compileSong('test4.wav', [channel0_stem.flat(), channel1_stem.flat()], 2, SAMPLE_RATE, '32f')
                }
                counterChunk++
                result0.dispose()
                result1.dispose()
            });
            console.log("End processing chunk: "+i)
            start+=chunk+1
            end = start+chunk
        }

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


    for(let i = 0; i < (number_of_frames - (number_of_frames % (FRAMES-PADDING))) ; i+=(FRAMES-PADDING)){
        let input = createInput(resultSTFT[0], resultSTFT[1], i)
        // prediction
        const output = tf.tidy(() => {
            let paddedPredict = model.predict(input["model_input"]);
            return paddedPredict.slice([PADDING/2, 0, 0, 0],[(FRAMES-PADDING), 1, 2, 2049])
        })

        // Used in normal tensorflow
        //const output = await model.predict(input["model_input"]);

        const estimateReshaped = tf.tidy(() => {
            let mix_angle = input["mix_angle"].slice([PADDING/2, 0, 0, 0],[(FRAMES-PADDING), 1, 2, 2049])

            let result = tf.mul(tf.complex(output, tf.zeros([FRAMES-PADDING, N_BATCHES, N_CHANNELS, FREQUENCES])),
                tf.exp(tf.complex(tf.zeros([FRAMES-PADDING, N_BATCHES, N_CHANNELS, FREQUENCES]), mix_angle)))
            // Reshaping to separate channels and remove "batch" dimension, so we can compute the istft
            return result.unstack(2).map(tensor => tensor.squeeze())
        });

        let res0 = istft(estimateReshaped[0], ispecParams)
        let res1 = istft(estimateReshaped[1], ispecParams)

        // Push into result 2 channels
        result = [[...result[0],...res0], [...result[1],...res1]]

    }

    return result;
}

/**
 *  A function that applies TF's STFT to a single Float32Array (a channel)
 * @param {*} channel
 * @returns A Float32Array that should be similar to the original channel
 */
function preProcessing(channel){
    console.log("Shape of input: " + channel.length)

    const input = tf.tensor1d(channel) // Here there's a bug that makes the array lose precision

    input.print(true)
    console.log(FRAME_LENGTH, HOP_LENGTH)
    let resultSTFT = tf.signal.stft(input, FRAME_LENGTH, HOP_LENGTH);
    console.log("Shape after STFT: ", resultSTFT.shape)

    return resultSTFT

}


//export { preProcessing };
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

    let pad =tf.zeros([5,2049], 'complex64')

    let paddedRes0 = tf.concat([pad,res0.slice([slice_start,0], [FRAMES-10, FREQUENCES]),pad])
    let paddedRes1 = tf.concat([pad,res1.slice([slice_start,0], [FRAMES-10, FREQUENCES]),pad])

    const model_input = tf.tidy(() => {
        let absChannel0 = tf.abs(paddedRes0)
        let absChannel1 = tf.abs(paddedRes1)
        return tf.stack([absChannel0, absChannel1]).transpose([1, 0, 2]).expandDims(1)
    });

    const mix_stft = tf.tidy(() => {
        return tf.stack([paddedRes0, paddedRes1]).transpose([1, 0, 2]).expandDims(1)
    })

    const mix_angle = tf.tidy(() => {
        return tf.atan2(tf.imag(mix_stft), tf.real(mix_stft))
    });

    mix_stft.dispose()
    pad.dispose()
    paddedRes0.dispose()
    paddedRes1.dispose()
    return {"model_input":model_input, "mix_angle":mix_angle}

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
        throw new Error('Data ' + data.length + 'is longer than length ' + length);
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
    console.log(expectedSignalLen)
    const istftResult = new Float32Array(expectedSignalLen);

    // Perform inverse ffts and extract it from tensor as an array
    let irfft = complex.irfft().arraySync()

    // Apply Window to inverse ffts
    for(let i = 0; i < nFrames - 1; i++){
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

exports.preProcessing = preProcessing;
exports.istft = istft;
exports.compileSong = compileSong;
exports.decodeFile = decodeFile;

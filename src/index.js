/**
 * Test file for STFT and ISTFT using tfjs and magenta/music
 */
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const mse = require('mse');
const wv = require('wavefile');
const decode = require('audio-decode');
const Lame = require("node-lame").Lame;
const FFT = require("fft.js");

const FRAME_LENGTH = 2048
const HOP_LENGTH = 1024
const NFFT = 2048
const SAMPLE_RATE = 22050
const PATCH_LENGTH = 256


const FREQUENCES = 1025 //2049
const FRAMES = 256 //100
const N_CHANNELS = 2
const N_BATCHES = 1
const PADDING = 8 // Padding for model prediction

const path = 'http://localhost:5000/modelJs/model.json'
const pb_path = "../model"
const AUDIO_PATH = '../data/audio_example.mp3'
// const AUDIO_PATH = "../data/Shallow_CUT.mp3"
// const AUDIO_PATH = "../data/Shallow_Lady_Gaga.mp3"

// STFT and ISTFT params:
const ispecParams = {
    winLength: FRAME_LENGTH,
    hopLength: HOP_LENGTH,
    nFft: NFFT
};

let padSize = 0
tf.enableProdMode()

let counterChunk = 0;

let win = readFile('../data/inverse_window')
let ifftWindowTF = tf.tensor1d(win, "float32")

//decodeFile(AUDIO_PATH);


// let arrayBuffer = fs.readFileSync('../data/sin').toString('utf-8');
// var jsonValues = JSON.parse(arrayBuffer);
// var ch0 = Object.values(jsonValues);
// let pre_ch0 = preProcessing(ch0)
// let res0 = postprocessing(pre_ch0)
// console.log("result length:", res0.length)
// compileSong('sine_test.wav', [res0], 1, SAMPLE_RATE, '32f')

let ch0 = readFile("../data/channel0")
let ch1 = readFile("../data/channel1")

let pre_ch0 = preProcessing(ch0)
let pre_ch1 = preProcessing(ch1)

let res0 = postprocessing(pre_ch0)
let res1 = postprocessing(pre_ch1)

compileSong('song_example.wav', [res0, res1], 2, SAMPLE_RATE, '32f')


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
            //decodeFromBuffer(buffer)
            decodeFromBuffer2(buffer)
        })
        .catch(error => {
            console.log(error)
        });
}


function decodeFromBuffer2(buffer){ //TODO separate this
    decode(buffer, (err, audioBuffer) => {

        console.log(audioBuffer.length)
        
         
        const result0 = preProcessing(audioBuffer._channelData[0]);
        const result1 = preProcessing(audioBuffer._channelData[1]);

        const istft0 = postprocessing(result0) //istft(result0, ispecParams)
        const istft1 = postprocessing(result1)//istft(result1, ispecParams)
        console.log("Compiling song without model")
        compileSong('withoutModel.wav', [istft0, istft1], 2, SAMPLE_RATE, '32f')

    });
}



/**
 *
 * @param buffer
 */
function decodeFromBuffer(buffer){ //TODO separate this
    decode(buffer, (err, audioBuffer) => {

        console.log("Buffer length: " + audioBuffer.length)
        const numPatches = Math.floor(Math.floor((audioBuffer.length - 1) / HOP_LENGTH) / PATCH_LENGTH) + 1;

        console.log("Num patches " + numPatches)
        // console.log(numPatches,(numPatches * PATCH_LENGTH * HOP_LENGTH), PATCH_LENGTH * HOP_LENGTH)
        let start = 0
        let channel0_stem = [];
        let channel1_stem = [];
        let chunk = Math.floor(audioBuffer.length / numPatches)
        let end = chunk
        console.log("chunk ", chunk)
        for (let i = 0; i < numPatches; i++) {
            console.log("Start processing chunk: "+i)
            const result0 = preProcessing(audioBuffer._channelData[0].slice(start, end));
            const result1 = preProcessing(audioBuffer._channelData[1].slice(start, end));
            loadAndPredict(path, [result0, result1])
                .then(arr => {

                channel0_stem[i] = arr[0];
                channel1_stem[i] = arr[1];

                if(counterChunk === numPatches - 1){
                    console.log("Compiling song")
                    compileSong('newModelTest.wav', [channel0_stem.flat(), channel1_stem.flat()], 2, SAMPLE_RATE, '32f')
                }
                counterChunk++
                result0.dispose()
                result1.dispose()
            })
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

    console.log("Number of frames", number_of_frames)

    //Fill with zeros
    if(number_of_frames < FRAMES){
        let fillZeros = FRAMES - number_of_frames
        let pad =tf.zeros([fillZeros,FREQUENCES], 'complex64')
        resultSTFT[0] = tf.concat([resultSTFT[0],pad])
        resultSTFT[1] = tf.concat([resultSTFT[1],pad])
    }
    //for(let i = 0; i < (number_of_frames - (number_of_frames % (FRAMES-PADDING))) ; i+=(FRAMES-PADDING)){
    // for(let i = 0; i < (number_of_frames - (number_of_frames % FRAMES)) ; i+= FRAMES){
        let input = createInput(resultSTFT[0], resultSTFT[1], 0)
        // prediction
        const output = tf.tidy(() => {
            return model.predict(input["model_input"]);
            // let paddedPredict = model.predict(input["model_input"]);
            // return paddedPredict.slice([(PADDING/2), 0, 0, 0],[(FRAMES-PADDING), 1, 2, FREQUENCES])
        })

        // Used in normal tensorflow
        //const output = await model.predict(input["model_input"]);

        // const estimateReshaped = tf.tidy(() => {
        //     let mix_angle = input["mix_angle"].slice([PADDING/2, 0, 0, 0],[(FRAMES-PADDING), 1, 2, FREQUENCES])
        //
        //     let result = tf.mul(tf.complex(output, tf.zeros([FRAMES-PADDING, N_BATCHES, N_CHANNELS, FREQUENCES])),
        //         tf.exp(tf.complex(tf.zeros([FRAMES-PADDING, N_BATCHES, N_CHANNELS, FREQUENCES]), mix_angle)))
        //     // Reshaping to separate channels and remove "batch" dimension, so we can compute the istft
        //     return result.unstack(2).map(tensor => tensor.squeeze())
        // });
        //
        // let res0 = istft(estimateReshaped[0], ispecParams)
        // let res1 = istft(estimateReshaped[1], ispecParams)

        let estimate = tf.mul(tf.complex(output, tf.zeros([FRAMES, N_BATCHES, N_CHANNELS, FREQUENCES])),
            tf.exp(tf.complex(tf.zeros([FRAMES, N_BATCHES, N_CHANNELS, FREQUENCES]), input["mix_angle"])))

        // Reshaping to separate channels and remove "batch" dimension, so we can compute the istft
        let estimateReshaped = estimate.unstack(2).map(tensor => tensor.squeeze()) // Tensor[]

        let res0 = istft(estimateReshaped[0], ispecParams)
        let res1 = istft(estimateReshaped[1], ispecParams)


        // Push into result 2 channels
        result = [[...result[0],...res0], [...result[1],...res1]]

    //}

    return result;
}

/**
 *  A function that applies TF's STFT to a single Float32Array (a channel)
 * @param {*} channel
 * @returns A Float32Array that should be similar to the original channel
 */
function preProcessing(channel){
    console.log("Shape of input: " + channel.length)
    const pad = enclosingPowerOfTwo(channel.length) - channel.length
    let paddedChannel = [...channel, ...new Float32Array(pad)]
    padSize = pad
    console.log("shape of input after padding: " + paddedChannel.length)
    const input = tf.tensor1d(paddedChannel, "float32") // Here there's a bug that makes the array lose precision
    let resultSTFT = tf.signal.stft(input, FRAME_LENGTH, HOP_LENGTH, NFFT);
    // let resultSTFT = tf.signal.stft(input, FRAME_LENGTH, HOP_LENGTH);
    console.log("Shape after STFT: ", resultSTFT.shape)
    return resultSTFT
}


//export { preProcessing };
/**
 *
 * @param input
 * @returns {Float32Array}
 */
function postprocessing(input){
    let resultISTFT = istft(input, ispecParams);
    console.log("Shape after ISTFT: ", resultISTFT.length)
    let result = resultISTFT.slice(padSize)
    console.log("Shape after slice: ", result.length)
    // let resultMSE = mse(resultISTFT.slice(0, channel.length-1), channel);
    // console.log('Channel data sets are different by ' + resultMSE);

    return result
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

    // let pad =tf.zeros([PADDING,FREQUENCES], 'complex64')
    //
    // let paddedRes0 = tf.concat([pad,res0.slice([slice_start,0], [FRAMES-PADDING, FREQUENCES]),pad])
    // let paddedRes1 = tf.concat([pad,res1.slice([slice_start,0], [FRAMES-PADDING, FREQUENCES]),pad])
    //
    // const model_input = tf.tidy(() => {
    //     let absChannel0 = tf.abs(paddedRes0)
    //     let absChannel1 = tf.abs(paddedRes1)
    //     return tf.stack([absChannel0, absChannel1]).transpose([1, 0, 2]).expandDims(1)
    // });
    //
    // const mix_stft = tf.tidy(() => {
    //     return tf.stack([res0, res1]).transpose([1, 0, 2]).expandDims(1)
    //     // return tf.stack([paddedRes0, paddedRes1]).transpose([1, 0, 2]).expandDims(1)
    // })
    //
    // const mix_angle = tf.tidy(() => {
    //     return tf.atan2(tf.imag(mix_stft), tf.real(mix_stft))
    // });
    //
    // mix_stft.dispose()
    // pad.dispose()
    // paddedRes0.dispose()
    // paddedRes1.dispose()
    // return {"model_input":model_input, "mix_angle":mix_angle}

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
function istft(complex, params, param) {
    console.log(complex.shape)

    const nFrames = complex.shape[0];
    const nFft = params.nFft || enclosingPowerOfTwo(complex.shape[1]);
    const winLength = params.winLength || nFft;
    const hopLength = params.hopLength || Math.floor(winLength / 4);

    // let ifftWindowTF = tf.hannWindow(winLength);

    let ifftWindow = ifftWindowTF.arraySync();

    // Adjust normalization for 75% Hann cola (factor of 1.5 with stft/istft).
    // console.log("normalization: " + param)
    // let normalization = 2*((1-hopLength)/nFft)
    //
    // for (let i = 0; i < ifftWindow.length; i++) {
    //     ifftWindow[i] = ifftWindow[i] / 1.5; //0.09569547896071921
    // }

    // Pad the window to be the size of nFft. Only if nFft != winLength.
    // if(nFft !== winLength){
        // console.log("here")
    //ifftWindow = padCenterToLength(ifftWindow, nFft);// nFft
    // }


    const expectedSignalLen = nFft + hopLength * (nFrames - 1);

    console.log("expectedSignalLen", expectedSignalLen, nFrames)
    const istftResult = new Float32Array(expectedSignalLen);


    // Perform inverse ffts and extract it from tensor as an array
    // let irfftTF = complex.irfft().arraySync()
    let irfftTF = complex.irfft()

    //Apply factor
    let factor = tf.mul(ifftWindowTF, tf.tensor(1.0))

    // Apply window
    let res = tf.mul(irfftTF, factor).arraySync()

    /**
     * ------Continues
     */
    // Apply Window to inverse ffts -> apply add and overlap!
    for(let i = 0; i < nFrames - 1; i++){
        let sample = i * hopLength;
        // let yTmp = ifft(reIm[i]);
        let yTmp = res[i];
        // let yTmp = irfftTF[i];
        // yTmp = tf.mul(yTmp, ifftWindow);
        // yTmp = applyWindow(yTmp, ifftWindow);
        yTmp = add(yTmp, istftResult.slice(sample, sample + nFft));
        istftResult.set(yTmp, sample);
    }

    return istftResult

}


function inverse_stft_window_fn(frame_step, frame_length, forward_window_fn = (f) => tf.hannWindow(f)){
//     with ops.name_scope(name, 'inverse_stft_window_fn', [forward_window_fn]):
//         frame_length = ops.convert_to_tensor(frame_length, name='frame_length')
//         frame_length.shape.assert_has_rank(0)

//     # Use equation 7 from Griffin + Lim.
//     forward_window = forward_window_fn(frame_length, dtype=dtype)
//     denom = math_ops.square(forward_window)
//     overlaps = -(-frame_length // frame_step)  # Ceiling division.
//     denom = array_ops.pad(denom, [(0, overlaps * frame_step - frame_length)])
//     denom = array_ops.reshape(denom, [overlaps, frame_step])
//     denom = math_ops.reduce_sum(denom, 0, keepdims=True)
//     denom = array_ops.tile(denom, [overlaps, 1])
//     denom = array_ops.reshape(denom, [overlaps * frame_step])

//     return forward_window / denom[:frame_length]
// return inverse_stft_window_fn_inner
    console.log(1)
    const forward_window = forward_window_fn(frame_length)
    console.log("uindou: ", forward_window)
    let denom = tf.square(forward_window)
   
    const overlaps = Math.ceil(frame_length/frame_step) // -(-frame_length / frame_step) but js
    console.log(overlaps)
    denom.print(true)
    denom = tf.pad(denom, [(0, overlaps * frame_step - frame_length)]) 
    denom = tf.reshape([overlaps, frame_step])
    denom = tf.sum(denom, 0, keepdims=true)
    denom = tf.tile(denom, [overlaps, 1])
    denom = tf.reshape(denom, [overlaps * frame_step])
    return forward_window / denom.slice(0, frame_length)

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

    //return resInterleaved
    let resInterLeavedTF = tf.tensor2d(resInterleaved);
    let addPad = tf.pad(resInterLeavedTF, [[1,0], [0,0]])

    return addPad.arraySync()
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

exports.preProcessing = preProcessing;
exports.istft = istft;
exports.compileSong = compileSong;
exports.decodeFile = decodeFile;
exports.postprocessing = postprocessing

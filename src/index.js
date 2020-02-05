/**
 * Test file for STFT and ISTFT using tfjs and magenta/music
 */
const DEBUG = false

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
const SAMPLE_RATE = 44100
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

//let win = readFile('../data/inverse_window')
//let ifftWindowTF = tf.tensor1d(win, "float32")
//
// decodeFile(AUDIO_PATH);

let ifftWindowTF = inverse_stft_window_fn(HOP_LENGTH,FRAME_LENGTH)

// let arrayBuffer = fs.readFileSync('C:/Users/Clara/Documents/Polytech/IG5_9/pfe/umx.js-pfe/data/sin').toString('utf-8');
// var jsonValues = JSON.parse(arrayBuffer);
// var ch0 = Object.values(jsonValues);
// let pre_ch0 = preProcessing(ch0,ispecParams)
// let res0 = postProcessing(pre_ch0, ispecParams,1, ifftWindowTF)
// console.log("result length:", res0.length)
// compileSong('test.wav', [res0], 1, SAMPLE_RATE, '32f')

let ch0 = readFile("../data/channel0")
let ch1 = readFile("../data/channel1")

let pre_ch0 = preProcessing(ch0,ispecParams)
let pre_ch1 = preProcessing(ch1,ispecParams)

let res0 = postProcessing(pre_ch0,ispecParams,1,ifftWindowTF)
let res1 = postProcessing(pre_ch1,ispecParams,1,ifftWindowTF)

compileSong('song_example.wav', [res0, res1], 2, SAMPLE_RATE/2, '32f')


/*--------------------- Functions ------------------------------------------------------------------------------------------------------*/

/**
 *
 * @param outputPath
 * @param channels [[channel1],[channel2]]
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
            let buffer = decoder.getBuffer();
            //decodeFromBuffer(buffer)
            // console.log("here")
            // decodeFromBuffer2(buffer)
            return buffer
        })
        .catch(error => {
            console.log(error)
        });
}


function decodeFromBuffer2(buffer){ //TODO separate this
    decode(buffer, (err, audioBuffer) => {

        console.log(audioBuffer.length)


        const result0 = preProcessing(audioBuffer._channelData[0], ispecParams);
        const result1 = preProcessing(audioBuffer._channelData[1], ispecParams);

        const istft0 = postProcessing(result0, ispecParams, 1.0, ifftWindowTF) //istft(result0, ispecParams)
        const istft1= postProcessing(result1, ispecParams, 1.0, ifftWindowTF) //istft(result0, ispecParams)
        console.log("Compiling song without model")
        compileSong('alface.wav', [istft0, istft1], 2, SAMPLE_RATE, '32f')

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
 * @param specParams
 * @returns A Float32Array that should be similar to the original channel
 */
function preProcessing(channel, specParams){
    console.log("Shape of input: " + channel.length)
    const pad = enclosingPowerOfTwo(channel.length) - channel.length
    let paddedChannel = [...channel, ...new Float32Array(pad)]
    padSize = pad
    console.log("shape of input after padding: " + paddedChannel.length)

    // const input = tf.tensor1d(paddedChannel, "float32") // Here there's a bug that makes the array lose precision
    const input = tf.tensor1d(channel, "float32") // Here there's a bug that makes the array lose precision

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
 *
 * @param input
 * @returns {Float32Array}
 */
function postProcessing(input, specParams, factor, win){
    let resultISTFT = istft(input, specParams, factor, win);
    if (DEBUG) console.log("Shape after ISTFT: ", resultISTFT.length)
    let result = resultISTFT.slice(padSize)
    if (DEBUG) console.log("Shape after slice: ", result.length)
    // let resultMSE = mse(resultISTFT.slice(0, channel.length-1), channel);
    // console.log('Channel data sets are different by ' + resultMSE);

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
function istft(complex, params, factor, ifftWindowTF) {
    const winFactor = factor || 1.0;
    const nFrames = complex.shape[0];
    const nFft = params.nFft || enclosingPowerOfTwo(complex.shape[1]);
    const winLength = params.winLength || nFft;
    const hopLength = params.hopLength || Math.floor(winLength / 4);

    console.log(complex.shape)
    // let ifftWindowTF0 = tf.hannWindow(winLength); //TODO fix to use the inverse windowing function

    //complex.print(true)

    // let pad = tf.zeros([shape0Pad,shape1Pad], 'complex64')
    // console.log(pad.shape)
    //
    // let paddedRes0 = tf.concat([pad,res0.slice([0,0], [FRAMES-PADDING, FREQUENCES])])


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

    console.log("irrftShape " + irfftTF.shape)

    //Padding part
    let shape0Pad = enclosingPowerOfTwo(irfftTF.shape[0]) - irfftTF.shape[0]
    let shape1Pad = enclosingPowerOfTwo(irfftTF.shape[1]) - irfftTF.shape[1]

    console.log("Paddings: " + shape0Pad, shape1Pad)

    // irfftTF = tf.pad2d(irfftTF, [[0,shape0Pad],[0, shape1Pad]])

    console.log("irrftShape after padding " + irfftTF.shape)

    // Adjust normalization for 2096/1024 (factor of 1.0 with stft/istft)
    // used by the model
    let normalizationFactor = tf.mul(ifftWindowTF, tf.tensor(winFactor));

    // Apply squared window
    let res = tf.mul(irfftTF, normalizationFactor).arraySync();

    console.log(nFrames, irfftTF.shape[0])

    // Overlap and add function (adds potentially overlapping frames of a signal)
    for(let i = 0; i < nFrames; i++){
        let sample = i * hopLength;
        let yTmp = res[i];
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
module.exports.decodeFile = decodeFile;
exports.postProcessing = postProcessing;
exports.readFile = readFile;

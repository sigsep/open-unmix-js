// const mmcore = require('@magenta/music/node/core/audio_utils')
const magenta = require('@magenta/music/node/gansynth/audio_utils')
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const mse = require('mse');

const FRAME_LENGTH = 4096 
const FRAME_STEP = 512

function readFile(file :  String) {
    let arrayBuffer = fs.readFileSync(file).toString('utf-8');
    let textByLine = arrayBuffer.split(" ");

    let floatArray = new Float32Array(textByLine.length - 1) // -1 cuz the last value is NaN

    let stringToFloatArray = textByLine.map(function(c) {
        return parseFloat(c).toPrecision(16);
    });

    stringToFloatArray = stringToFloatArray.slice(0, -1); // Remove the last element NaN

    floatArray = stringToFloatArray; 

    // inverse spec params:
    let inverse_params = {
        hopLength: FRAME_STEP,
        sampleRate: 44100,
        winLength: FRAME_LENGTH
    }
    const input = tf.tensor1d(floatArray, 'float32')

    let result = tf.signal.stft(input, FRAME_LENGTH, FRAME_STEP)

    let inverse_result = magenta.istft(result, inverse_params)
    console.log(inverse_result)
    //console.log(floatArray, inverse_result)

}

const globalAny : any = global;
globalAny.performance = Date;
globalAny.fetch = require('node-fetch');

readFile('channel0');


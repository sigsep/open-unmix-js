const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');

const FRAME_LENGTH = 4096 // patch length?
const FRAME_STEP = 512 //HOP Size ?

function readFile(file) {
    let arrayBuffer = fs.readFileSync(file).toString('utf-8');
    let textByLine = arrayBuffer.split(" ");

    let floatArray = new Float32Array(textByLine.length - 1) // -1 cuz the last value is NaN

    let stringToFloatArray = textByLine.map(function(c) {
        return parseFloat(c).toPrecision(16);
    });

    stringToFloatArray = stringToFloatArray.slice(0, -1); // Remove the last element NaN

    floatArray = stringToFloatArray; //trying to keep precision but it doesnt work :(

    //TODO precision error here, it only keep 6 decimal
    // Here there's a bug that makes the array loses precision
    // If remove the 'float32' param tf casts the array as string not being able to perform the STFT
    const input = tf.tensor1d(floatArray, 'float32')

    input.print(true);

    let result = tf.signal.stft(input, FRAME_LENGTH, FRAME_STEP);

    result.print(true);

}

readFile('channel0');




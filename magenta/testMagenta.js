//const mmcore = require('../../magenta-js/music/src/core/audio_utils.ts')

const mmcore = require('@magenta/music/node/core/audio_utils')
const inverse = require('@magenta/music/node/gansynth/audio_utils')
const fs = require('fs');
const FFT = require('fft.js');

function readFile(file) {
    let arrayBuffer = fs.readFileSync(file).toString('utf-8');
    let textByLine = arrayBuffer.split(" ");

    let floatArray = new Float32Array(textByLine.length - 1) // -1 cuz the last value is NaN

    let stringToFloatArray = textByLine.map(function(c) {
        return parseFloat(c).toPrecision(16);
    });

    stringToFloatArray = stringToFloatArray.slice(0, -1); // Remove the last element NaN

    floatArray = stringToFloatArray; //trying to keep precision but it doesnt work :(

    let params = {sampleRate: 44100}
    let x = mmcore.stft(floatArray, params)
    console.log(x)

}


readFile('channel0');


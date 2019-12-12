'use strict';
const fs = require('fs');
let wav = require('node-wav');
let STFT = require('stft');
var KissFFT = require('kissfft-js');

var A2_1024 = require('./audioBuffer');

const FFT_SIZE = 4096;
const PATCH_LENGTH = 512;
const HOP_SIZE = 1024;
const SR = 44100;


function readFile(file) {
    let buffer = fs.readFileSync(file);
    let result = wav.decode(buffer);
    console.log(result.sampleRate);
    console.log(result.channelData[0].length);
    //console.log(result.channelData[0], true);

    //console.log(result.channelData); // array of Float32Arrays

    if(result.channelData.length !== 2){
        console.log("Only stereo data is supported");
    }

    let numOfPatches = Math.floor(Math.floor((result.channelData[0].length - 1) / HOP_SIZE) / PATCH_LENGTH) + 1;
    let ix = stftPassThru(FFT_SIZE, result.channelData[0]).length

    console.log("ix: "+ ix)

    //console.log(A2_1024.length)

    // var fftr = new KissFFT.FFTR(FFT_SIZE);
    // var transform = fftr.forward(result.channelData[0]);
    // var transScaled = scaleTransform(transform, FFT_SIZE);
    // var a2_again = fftr.inverse(transScaled);
    //
    // //console.log(a2_again.length)
    //
    // fftr.dispose();


    console.log("num of patches: "+ numOfPatches);

}

function stftPassThru(frame_size, input) {
    var stft = STFT(1, frame_size, onfft, HOP_SIZE)
    var istft = STFT(-1, frame_size, onifft)
    var output = new Float32Array(input.length)
    var in_ptr = 0
    var out_ptr = 0

    function onfft(x, y) {
        istft(x, y)
    }

    function onifft(v) {
        //console.log(Array.prototype.slice.call(v))
        for(var i=0; i<v.length; ++i) {
            output[out_ptr++] = v[i]
        }
    }

    for(var i=0; i+frame_size<=input.length; i+=frame_size) {
        stft(input.subarray(i, i+frame_size))
    }
    stft(new Float32Array(frame_size))
    return output
}

console.log("teste")
readFile("/Users/delton/pfe/ex1.wav")

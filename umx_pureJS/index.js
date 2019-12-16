//'use strict';
const fs = require('fs');
let wav = require('node-wav');
let shortTimeFT = require('stft');


const FFT_SIZE = 4096;
const PATCH_LENGTH = 512;
const HOP_SIZE = 1024;
const SR = 44100;

var aud = {};
var aud2 = {};

function readFile(file) {
    let buffer = fs.readFileSync(file);
    let result = wav.decode(buffer);
    console.log(result.sampleRate);
    console.log(result.channelData[0].length);
    //console.log(result.channelData[0]);

    //console.log(result.channelData); // array of Float32Arrays

    if(result.channelData.length !== 2){
        console.log("Only stereo data is supported");
    }

    let numOfPatches = Math.floor(Math.floor((result.channelData[0].length - 1) / HOP_SIZE) / PATCH_LENGTH) + 1;
//         aud.mag.push(re); //mag  .push(fmag);
//         aud.phase.push(im); //phase.push(fphase);

    //aud.mag   = []; // freq
    //aud.phase = []; // time
    aud.mstem = []; // channel


    // aud.mag  = [[],[]]; //freq
    // aud.phase  = [[],[]]; //time
    aud.mag  = []; //freq
    aud.phase  = []; //time


    var stat = false;

    var reIm = []
    /**
     * Function used to calculate magnitude and imag
     * @param real
     * @param imag
     */
    function onFreq (real, imag) {
        var formatted = []

        //Get first value for test check
        if(!stat){
            // reIm = [real.subarray(0, 100),imag.subarray(0, 100)]
            //reIm = [real.subarray(0, 10)]
            stat = true
        }

        // const fmag   = new Float32Array(FFT_SIZE / 2 + 1); //2049
        // const fphase = new Float32Array(FFT_SIZE / 2 + 1); //2049
        const fmag   = new Float32Array(real.length);
        const fphase = new Float32Array(real.length);
        for (var i = 0; i < real.length; i++) { //

            //Phase magnitude is calculated as
            //real = √(a^2+b^2)
            fmag[i] = Math.sqrt(Math.pow(real[i], 2) + Math.pow(imag[i], 2));

            //Phase angle = arctang2(imag,real)
            fphase[i] = Math.atan2(imag[i], real[i]);

        }
        aud.mag.push(fmag);
        aud.phase.push(fphase);
        //console.log(real.length);
        // console.log(babar(formatted, { width: 128, height: 32 }))
    }



    const proc_frames = numOfPatches * PATCH_LENGTH;

    console.log("proc_frames " + proc_frames);

    const stft = shortTimeFT(1, proc_frames, onFreq, HOP_SIZE);

    //TODO iterate through channels
    //Ref to #1 in oldJs
    for(var channel = 0; channel < 2; channel++){
        for(var i=0; i+proc_frames<=result.channelData[channel].length; i+=proc_frames) {
            //console.log("Processing part " + i + "/" + proc_frames)
            stft(result.channelData[channel].subarray(i, i+proc_frames))
        }
    }

    //console.log(reIm)
    console.log("mag new")
    console.log(aud.mag[0].subarray(0, 10))

    // for(var i = 0; i < 100; i++){
    //     console.log(aud.mag[0][i])
    // }

    /**
     * old
     * @type {Array}
     */


    aud2.mag  = []; //freq
    aud2.phase  = []; //time

    const spec = mySTFT(result.channelData[0], FFT_SIZE, HOP_SIZE, numOfPatches * PATCH_LENGTH);

    // console.log("spectogram: ");
    // var realPart = spec[0].subarray(0, 20) //20 since only odds are the real part
    // var res = realPart.filter(function(v, i) {
    //     return i % 2 === 0;
    // });

    //console.log(res);


    const mag2   = [];
    const phase2 = [];
    var mmax = 0;

    // [#1] REF
    for (var i = 0; i < spec.length; i++) {
        const fmag   = new Float32Array(FFT_SIZE / 2 + 1); //2049
        const fphase = new Float32Array(FFT_SIZE / 2 + 1); //2049
        for (var j = 0; j < FFT_SIZE / 2 + 1; j++) {

            fmag  [j] = Math.sqrt(Math.pow(spec[i][j*2+1], 2) + Math.pow(spec[i][j*2+0], 2));

            //Phase angle = arctang2(x, y)
            // spec[i][j*2+0] real
            fphase[j] = Math.atan2(spec[i][j*2+1], spec[i][j*2+0]);
            //values [real, im]
            // par =
            //       [    ,   ]

        }
        mag2  .push(fmag);
        phase2.push(fphase);
    }
    aud2.mag.push(mag2);
    aud2.phase.push(phase2);

    console.log("mag old");
    console.log(aud2.mag[0][0].subarray(0, 10)) //aud2.mag[channel][]
    //console.log(aud2.mag[0].pop())

}

function stftPassThru(frame_size, input) {
    var stft = STFT(1, frame_size, onfft)
    var istft = STFT(-1, frame_size, onifft)
    var output = new Float32Array(input.length)
    var in_ptr = 0
    var out_ptr = 0

    function onfft(x, y) {
        istft(x, y)
    }

    function onifft(v) {
        console.log(Array.prototype.slice.call(v))
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

console.log(Array.prototype.slice.call(stftPassThru(8, new Float32Array([
    0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
]))))

console.log("teste")
readFile("/Users/delton/pfe/audio_example.mp3")

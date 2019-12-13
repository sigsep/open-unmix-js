//'use strict';
const fs = require('fs');
let wav = require('node-wav');
var shortTimeFT = require('stft'); //(1, 4096, onFreq); //4096 = FFT_SIZE
var babar = require('babar');
//var stftOld = require('./stft');
// var KissFFT = require('kissfft-js');
//
// var A2_1024 = require('./audioBuffer');


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


/**
 * STTFT old
 * @param frame_size
 * @returns {[]}
 */

function initWindow(frame_size) {
    const win = [];
    for (var i = 0; i < frame_size; i++) {
        win[i] = 0.5 - 0.5 * Math.cos(2.0 * Math.PI * i / frame_size);
    }
    return win;
}

// http://yukara-13.hatenablog.com/entry/2013/11/17/210204
function mySTFT(src, frame_size, hop_size, proc_frames) {
    const win = initWindow(frame_size);  // hann窓を作る
    const out = new Array();
    const signal = new Float32Array(frame_size*2);

    // proc_frames 2560
    for (var i = 0; i < proc_frames; i++) {
        const start = hop_size * i - frame_size / 2;
        if (start > src.length) {
            out.push(new Float32Array((frame_size / 2 + 1) * 2)); // ((4096/2)+1)*2) = 4098
            continue;
        } else if (start < 0) {
            for (var j = 0; j < frame_size; j++) {
                signal[j*2+0] = src[Math.abs(start + j)] * win[j]; // reflect
                signal[j*2+1] = 0;
            }
        } else if (start + frame_size > src.length) {
            for (var j = 0; j < frame_size; j++) {
                const exc = (start + j) - src.length;
                signal[j*2+0] = ((start + j < src.length) ? src[start + j] : src[src.length - 1 - exc]) * win[j]; // reflect
                signal[j*2+1] = 0;
            }
        } else {
            for (var j = 0; j < frame_size; j++) {
                signal[j*2+0] = src[start + j] * win[j];
                signal[j*2+1] = 0;
            }
        }

        const phasors = myFFT(signal);
        const half = new Float32Array((frame_size / 2 + 1)*2);
        for (var j = 0; j < frame_size / 2 + 1; j++) {
            half[j*2+0] = phasors[j*2+0]; //Real
            half[j*2+1] = phasors[j*2+1]; //Im
        }
        out.push(half);
    }
    return out;
}

function myISTFT(dst, mag, phase, frame_size, hop_size, proc_frames) {
    const win = initWindow(frame_size);  // hann窓を作る
    const fphasors = new Float32Array(frame_size*2);
    for (var i = 0; i < proc_frames; i++) {
        const start = hop_size * i - frame_size / 2;
        if (start > dst.length) {
            return;
        }
        const fmag   = mag  [i];
        const fphase = phase[i];

        for (var j = 0; j < frame_size / 2 + 1; j++) {
            fphasors[j*2+0] = Math.cos(fphase[j]) * fmag[j];
            fphasors[j*2+1] = Math.sin(fphase[j]) * fmag[j];
        }
        for (var j = 0; j < frame_size / 2 - 1; j++) {
            fphasors[(frame_size - 1 - j)*2+0] =  fphasors[(1 + j)*2+0];
            fphasors[(frame_size - 1 - j)*2+1] = -fphasors[(1 + j)*2+1];
        }

        const signal = myIFFT(fphasors);

        if (start < 0) {
            for (var j = -start; j < frame_size; j++) {
                dst[start + j] += signal[j*2+0] * win[j];
            }
        } else if (start + frame_size > dst.length) {
            for (var j = 0; j < frame_size && start + j < dst.length; j++) {
                dst[start + j] += signal[j*2+0] * win[j];
            }
        } else {
            for (var j = 0; j < frame_size; j++) {
                dst[start + j] += signal[j*2+0] * win[j];
            }
        }
    }
}

// http://www.kurims.kyoto-u.ac.jp/~ooura/fftman/ftmn1_2.html
function myFFT(a){
    const n = a.length / 2;
    const theta = -2 * Math.PI / n;
    /* ---- scrambler ---- */
    var i = 0;
    for (var j = 1; j < n - 1; j++) {
        for (var k = n >> 1; k > (i ^= k); k >>= 1);
        if (j < i) {
            var xr = a[j*2+0];
            var xi = a[j*2+1];
            a[j*2+0] = a[i*2+0];
            a[j*2+1] = a[i*2+1];
            a[i*2+0] = xr;
            a[i*2+1] = xi;
        }
    }
    var m;
    for (var mh = 1; (m = mh << 1) <= n; mh = m) {
        var irev = 0;
        for (i = 0; i < n; i += m) {
            var wr = Math.cos(theta * irev);
            var wi = Math.sin(theta * irev);
            for (var k = n >> 2; k > (irev ^= k); k >>= 1);
            for (var j = i; j < mh + i; j++) {
                k = j + mh;
                xr = a[j*2+0] - a[k*2+0];
                xi = a[j*2+1] - a[k*2+1];
                a[j*2+0] += a[k*2+0];
                a[j*2+1] += a[k*2+1];
                a[k*2+0] = wr * xr - wi * xi;
                a[k*2+1] = wr * xi + wi * xr;
            }
        }
    }
    return a;
}

function myIFFT(a) {
    const ca = new Float32Array(a.length);
    for (var i = 0; i < a.length / 2; i++) {
        ca[i*2+0] =  a[i*2+0];
        ca[i*2+1] = -a[i*2+1];
    }
    const ps = myFFT(ca);
    const out = new Float32Array(ps.length);
    for (var i = 0; i < ps.length / 2; i++) {
        out[i*2+0] =  ps[i*2+0] / (ps.length / 2);
        out[i*2+1] = -ps[i*2+1] / (ps.length / 2);
    }
    return out;
}



console.log("teste")
readFile("/Users/delton/pfe/ex1.wav")

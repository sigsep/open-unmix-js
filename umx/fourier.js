//let wav = require('node-wav');
//var shortTimeFT = require('stft'); //(1, 4096, onFreq); //4096 = FFT_SIZE

const FFT_SIZE = 4096; // Frame length?
const PATCH_LENGTH = 512; // Frame step? In py = 1024?
const HOP_SIZE = 1024; //
const SR = 44100; // Sampling rate
const fs = require('fs');
const decode = require('audio-decode');
const buffer = require('audio-lena/mp3');
var toWav = require('audiobuffer-to-wav')
const WaveFile = require('wavefile');
const mse = require('mse');


const STFT = require("stft")

function readFile(file) {
    let arrayBuffer = fs.readFileSync(file);
    decodeFile(file, arrayBuffer)
}

function decodeFile(fileName, arrayBuffer) {
    decode(arrayBuffer, (err, audioBuffer) => {
        try {
            console.log(audioBuffer.duration)
            let wavFile1 = stftPassThru(FFT_SIZE, audioBuffer._channelData[0])
            let wavFile2 = stftPassThru(FFT_SIZE, audioBuffer._channelData[1])

            let output = new Float32Array(wavFile1, wavFile2)

            console.log(output.length)

            let result = mse(output, audioBuffer._data); /* results in a calcuation of 5.3125 */
            if (result !== 0) {
                console.log('data sets are different by ' + result);
            }

            let wav = new WaveFile();
            wav.fromScratch(2, audioBuffer.sampleRate, '32f',
                output);

            console.log(wav.chunkSize)
            fs.writeFileSync('alface2.wav', wav.toBuffer());

        } catch (e) {
            console.log(e)
            throw e;
        }
    });
}

function stftPassThru(frame_size, input) {
    var stft = STFT(1, frame_size, onfft)
    var istft = STFT(-1, frame_size, onifft)
    var output = new Float32Array(input.length)
    var in_ptr = 0
    var out_ptr = 0

    function onfft(re, im) {
        // console.log("real: " + re)
        // console.log("imaginary: " + im)
        
        istft(re, im)
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


readFile('audio_example.mp3')
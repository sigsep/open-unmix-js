const assert = require('assert');
const tf = require('@tensorflow/tfjs-node');
const code = require('../src/index')
const mse = require('mse');
const fs = require('fs');

const wv = require('wavefile');
const decode = require('audio-decode');
const Lame = require("node-lame").Lame;

//Constants
const FRAME_LENGTH = 2048;
const HOP_LENGTH = 1024;
const FFT_SIZE = 2048;

// STFT-ISTFT params:
const specParams = {
    winLength: FRAME_LENGTH,
    hopLength: HOP_LENGTH,
    fftLength: FFT_SIZE
};

const AUDIO_PATH = 'data/audio_example.mp3'

let win = code.readFile('data/inverse_window')
let ifftWindowTF = tf.tensor1d(win, "float32")

// STFT  test
describe('Signal -> STFT -> ISTFT -> Signal', function() {
    it('should return an error lower than 10e-6', function() {
        this.enableTimeouts(false)
        // 32768 2^15
        // 262144 2^18
        // 1048576 2^20
        const real = tf.randomNormal([1048576]).arraySync();
        const testSignal = code.preProcessing(real, specParams)

        for(let i = 1.50; i > 0; i-=0.5){
            let preProcessedSignal = code.postProcessing(testSignal, specParams, parseFloat(i.toPrecision(2)), ifftWindowTF)
            let resultMSE = mse(real, preProcessedSignal);
            console.log('Error for factor '+parseFloat(i.toPrecision(2))+': ' + resultMSE + '\n')
        }

    });
});

describe('Music -> STFT -> ISTFT -> Music', function() {
    it('should return the original music', async function(done) {
        this.timeout(0);

        await code.decodeFile(AUDIO_PATH)
            .then(decodeFile => {
                decode(decodeFile, (err, audioBuffer) => {
                    const stftMusic0 = code.preProcessing(audioBuffer._channelData[0], specParams)
                    const stftMusic1 = code.preProcessing(audioBuffer._channelData[1], specParams)

                    let processedSignal0 = code.postProcessing(stftMusic0, specParams, 1.0, ifftWindowTF);
                    let processedSignal1 = code.postProcessing(stftMusic1, specParams, 1.0, ifftWindowTF);

                    let diff = audioBuffer._channelData[0].length - processedSignal0.length
                    let padDiff = new Float32Array(diff)

                    //Insert zeros in front of processed signal to be as exact size as the original one
                    processedSignal0 = [...processedSignal0, ...padDiff]
                    processedSignal1 = [...processedSignal1, ...padDiff]


                    let resultMSE0 = mse(audioBuffer._channelData[0], processedSignal0);
                    let resultMSE1 = mse(audioBuffer._channelData[1], processedSignal1);

                    console.log("MSE: ", resultMSE0, resultMSE1)

                    let wav = new wv.WaveFile();

                    wav.fromScratch(2, 44100, '32f', [processedSignal0, processedSignal1]);

                    fs.writeFileSync('exampleCorrect.wav', wav.toBuffer());

                })
            })
    });
});

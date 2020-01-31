const assert = require('assert');
const tf = require('@tensorflow/tfjs-node');
const code = require('../src/index')
const mse = require('mse');

const wv = require('wavefile');
const decode = require('audio-decode');
const Lame = require("node-lame").Lame;

//Constants
const FRAME_LENGTH = 4096;
const HOP_LENGTH = 1024;

// STFT-ISTFT params:
const specParams = {
    winLength: FRAME_LENGTH,
    hopLength: HOP_LENGTH,
};

const AUDIO_PATH = 'data/audio_example.mp3'

// STFT  test
describe('Signal -> STFT -> ISTFT -> Signal', function() {
    it('should return an error lower then 10e-6', function() {
        this.enableTimeouts(false)
        const real = tf.randomNormal([1048576]).arraySync(); //2^20
        const tensor = tf.tensor1d(real)
        const testSignal = tf.signal.stft(tensor, FRAME_LENGTH, HOP_LENGTH)
        let preProcessedSignal = code.istft(testSignal, specParams);
        console.log(real.length, preProcessedSignal.length)
        let resultMSE = mse(real, preProcessedSignal);
        console.log(resultMSE)
    });
});

describe('Music -> STFT -> ISTFT -> Music', function() {
    it('should return the original music', function() {
        this.enableTimeouts(false)
        code.decodeFile(AUDIO_PATH).then(decodeFile => {
            console.log(decodeFile)
            decode(decodeFile, (err, audioBuffer) => {
                console.log(audioBuffer)
                const musicSignalChannel0 = tf.tensor1d(audioBuffer._channelData[0])
                const musicSignalChannel1 = tf.tensor1d(audioBuffer._channelData[1])
                const stftMusic0 = tf.signal.stft(musicSignalChannel0, FRAME_LENGTH, HOP_LENGTH)
                const stftMusic1 = tf.signal.stft(musicSignalChannel1, FRAME_LENGTH, HOP_LENGTH)

                let processedSignal0 = code.istft(stftMusic0, specParams);
                let processedSignal1 = code.istft(stftMusic1, specParams);

                code.compileSong('testStftIstft.wav', [processedSignal0, processedSignal1], 2, 22050, '32f')

            })
        })
    });
});

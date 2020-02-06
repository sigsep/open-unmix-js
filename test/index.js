const assert = require('assert');
const tf = require('@tensorflow/tfjs-node');
const code = require('../src/index')

//Constants
const FRAME_LENGTH = 2048;
const HOP_LENGTH = 1024;
const FFT_SIZE = 2048;
const PATCH_LENGTH = 256

const WAVE_LENGTH = 220500;
let signal

// STFT-ISTFT params:
const specParams = {
    winLength: FRAME_LENGTH,
    hopLength: HOP_LENGTH,
    fftLength: FFT_SIZE
};


const AUDIO_PATH = 'data/audio_example.mp3'
// const AUDIO_PATH = 'data/sine.mp3'
// const AUDIO_PATH = "data/Shallow_CUT.mp3"
// const AUDIO_PATH = "data/Shallow_Lady_Gaga.mp3"

// STFT  test
describe('Signal -> STFT -> ISTFT -> Signal', function() {
    it('should return an error lower than 10e-6 when using random signal', function() {
        signal = tf.randomNormal([32768]).arraySync(); // 32768 2^15
    });

    it('should return an error lower than 10e-6 when using sine signal', function() {
        signal = new Float32Array(WAVE_LENGTH)
        for(let i = 0; i < WAVE_LENGTH; i++){
            signal[i] = Math.sin(i)
        }
    });

    afterEach(function(){
        const testSignal = code.preProcessing(signal, specParams)

        let preProcessedSignal = code.postProcessing(testSignal, specParams, 1.0)

        let processedLength = preProcessedSignal.length
        let diffChannelLength = (processedLength - signal.length);

        let res = tf.losses.meanSquaredError(
            signal,
            preProcessedSignal.slice(0, processedLength - diffChannelLength))

        assert.ok(res.arraySync() < 10e-6)
    })

});

describe('Music -> STFT -> ISTFT -> Music', function() {
    it('should return the original sine wave', async function(done) {
        this.timeout(0);

        let decodedFile = await code.decodeFile(AUDIO_PATH)
        let decodedFromBuffer = await code.decodeFromBuffer
        (decodedFile)

        const stftMusic0 = code.preProcessing(decodedFromBuffer._channelData[0], specParams)
        const stftMusic1 = code.preProcessing(decodedFromBuffer._channelData[1], specParams)

        let processedSignal0 = code.postProcessing(stftMusic0, specParams, 1.0);
        let processedSignal1 = code.postProcessing(stftMusic1, specParams, 1.0);

        let channelLength = decodedFromBuffer._channelData[0]
        let processedLength = processedSignal0.length

        processedSignal0 = code.insertZeros(processedSignal0, processedLength, channelLength, specParams)
        processedSignal1 = code.insertZeros(processedSignal1, processedLength, channelLength, specParams)

        // Generate buffer dic to create waveFile
        let bufferOutput = {
            numberOfChannels: 2,
            sampleRate: 44100,
            channelData: [processedSignal0, processedSignal1]
        }

        console.log("Generating wave file")
        code.createWave(bufferOutput, 'outPutWave.wav')

    });

    it('should return only the voice when using the model', async function(done) {
        this.timeout(0);

        let decodedFile = await code.decodeFile(AUDIO_PATH)
        let decodedFromBuffer = await code.decodeFromBuffer(decodedFile)

        const numPatches = Math.floor(Math.floor((decodedFromBuffer.length - 1) / HOP_LENGTH) / PATCH_LENGTH) + 1;

        console.log("Num patches " + numPatches)

        let start = 0
        let channel0_stem = [];
        let channel1_stem = [];
        let chunk = Math.floor(decodedFromBuffer.length / numPatches)
        let end = chunk
        for (let i = 0; i < numPatches; i++) {
            console.log("Start processing chunk: "+i)
            const result0 = code.preProcessing(decodedFromBuffer._channelData[0].slice(start, end), specParams);
            const result1 = code.preProcessing(decodedFromBuffer._channelData[1].slice(start, end), specParams);
            let predict = await code.loadAndPredict('', [result0, result1], specParams)
            channel0_stem[i] = predict[0];
            channel1_stem[i] = predict[1];
            console.log("End processing chunk: "+i)
            start+=chunk+1
            end = start+chunk
        }

        let processedSignal0 = channel0_stem.flat()
        let processedSignal1 = channel1_stem.flat()

        let channelLength = decodedFromBuffer._channelData[0]
        let processedLength = processedSignal0.length

        processedSignal0 = code.insertZeros(processedSignal0, processedLength, channelLength, specParams)
        processedSignal1 = code.insertZeros(processedSignal1, processedLength, channelLength, specParams)

        // Generate buffer dic to create waveFile
        let bufferOutput = {
            numberOfChannels: 2,
            sampleRate: 44100,
            channelData: [processedSignal0, processedSignal1]
        }

        console.log("Generating wave file")
        code.createWave(bufferOutput, 'outPutWaveModel.wav')

    });

});

const assert = require('assert');
const tf = require('@tensorflow/tfjs-node');
const code = require('../src/open-unmix')

//Constants
const FRAME_LENGTH = 2048;
const HOP_LENGTH = 1024;
const FFT_SIZE = 2048;
const PATCH_LENGTH = 256
const N_FRAMES = 256

const WAVE_LENGTH = 220500;
let signal

// STFT-ISTFT params:
const specParams = {
    winLength: FRAME_LENGTH,
    hopLength: HOP_LENGTH,
    fftLength: FFT_SIZE
};

const AUDIO_PATH = 'data/audio_example.mp3'
//const AUDIO_PATH = 'data/sine.mp3'
// const AUDIO_PATH = "data/Shallow_CUT.mp3"
// const AUDIO_PATH = "data/Shallow_Lady_Gaga.mp3"

function range(min, max) {
    let len = max - min + 1;
    let arr = new Array(len);
    for (let i=0; i<len; i++) {
        arr[i] = min + i;
    }
    return arr;
}

function generateSineWave(power){
    let sinLength = Math.pow(2, power)
    let retval = new Float32Array(sinLength)
    for (let i = 0; i < sinLength; i++) {
        retval[i] = Math.sin(i)
    }
    return retval
}

let provider = range(10, 23)

describe('[Correctness Test] Signal -> STFT -> ISTFT -> Signal', function() {
    let power = 15
    it('should return an error lower than 10e-6 when using random signal', function() {
        //Generate random array
        signal = tf.randomNormal([Math.pow(2,power)]).arraySync();
    });

    it('should return an error lower than 10e-6 when using sine signal', function() {
        //Generate a sine wave
        signal = generateSineWave(power)
    });

    afterEach(function(){
        let originalArray = signal
        let signalLength = signal.length
        //Perform pre processing (paddings and STFT)
        signal = code.preProcessing(signal, specParams)
        //Perform post processing (ISTFT)
        let ISTFTResult = code.istft(signal, specParams, 1.0);
        let posProcessed = tf.tensor1d(ISTFTResult)
        posProcessed = code.padSignal(posProcessed, specParams, false).arraySync();
        let processedLength = posProcessed.length
        let diffChannelLength = (processedLength - signalLength);
        let res = tf.losses.meanSquaredError(
            originalArray,
            posProcessed.slice(0, processedLength - diffChannelLength))

        assert.ok(res.arraySync() < 10e-6)
    })
});

describe('[Perfomance Test] Signal -> STFT -> ISTFT -> Signal', function () {
    this.timeout(0)

    function makeTestSine(pow) {
        it.skip('sine wave size 2^'+pow, function(done) {
            let sinLength = Math.pow(2, pow)
            signal = generateSineWave(sinLength)

            console.time('test');
            //Perform pre processing (paddings and STFT)
            signal = code.preProcessing(signal, specParams)

            //Perform post processing (ISTFT)
            let ISTFTResult = code.istft(signal, specParams, 1.0);

            let posProcessed = tf.tensor1d(ISTFTResult)

            posProcessed = code.padSignal(posProcessed, specParams, false).arraySync();
            console.timeEnd('test');

            signal = []
            done()
        });
    }

    function makeTestRandom(pow) {
        it.skip('random size 2^'+pow, function(done) {
            let sinLength = Math.pow(2, pow)
            signal = tf.randomNormal([sinLength]).arraySync(); // 32768 2^15

            console.time('test');
            //Perform pre processing (paddings and STFT)
            signal = code.preProcessing(signal, specParams)

            //Perform post processing (ISTFT)
            let ISTFTResult = code.istft(signal, specParams, 1.0);

            let posProcessed = tf.tensor1d(ISTFTResult)

            posProcessed = code.padSignal(posProcessed, specParams, false).arraySync();
            console.timeEnd('test');

            signal = []
            done()
        });
    }

    for (let i in provider) {
        makeTestRandom(provider[i]);
    }

    for (let i in provider) {
        makeTestSine(provider[i]);
    }

});


describe('[White box - coverage] Music -> STFT -> ISTFT -> Music', function() {
    this.timeout(0);
    function makeTestModelSine(pow) {
        it.skip('sine wave size 2^'+pow, async function(done) {
            signal = generateSineWave(pow)

            console.time('test');
            await code.loadModel()

            await code.modelProcess('http://localhost:5000/model/model.json', signal, signal)
            console.timeEnd('test');

            signal = []
            done()
        });
    }

    for (let i in provider) {
        makeTestModelSine(provider[i]);
    }

    it.skip('should return only the voice when using the model', async function(done) {
        this.timeout(0);
        console.log(tf.getBackend());
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
            const result1 = code.preProcessing(decodedFromBuffer._channelData[0].slice(start, end), specParams);
            let predict = await code.loadAndPredict('', [result0, result1], specParams)
            channel0_stem[i] = predict[0];
            channel1_stem[i] = predict[1];
            console.log("End processing chunk: "+i)
            start+=chunk+1
            end = start+chunk
        }

        let processedSignal0 = channel0_stem.flat()
        let processedSignal1 = channel1_stem.flat()

        let channelLength = decodedFromBuffer._channelData
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
        //code.createWave(bufferOutput, 'outPutWaveModel.wav')

    });

});


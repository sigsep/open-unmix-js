const assert = require('assert');
const tf = require('@tensorflow/tfjs-node');
const openUnmix = require('../src/open-unmix')
const config = require('../config/config.json');

const decode = require('audio-decode');
const Lame = require("node-lame").Lame;

let signal

// STFT-ISTFT params:
const specParams = {
    winLength: config.fourierParams.frameLength,
    hopLength: config.fourierParams.hopLength,
    fftLength: config.fourierParams.fftSize
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

/**
 * Returns decoded file as buffer
 * @param path
 * @return buffer to process
 */
async function decodeFile(path){
    const decoder = new Lame({
        output: "buffer",
        bitrate: 192,
    }).setFile(path);

    return decoder
        .decode()
        .then(() => {
            return decoder.getBuffer();
        })
        .catch(error => {
            console.log(error)
        });
}

/**
 * Decode the buffer to float32Array with expected channels
 * @param buffer
 * @return AudioBuffer{
 *     length,
 *     numberOfChannels
 *     sampleRate,
 *     duration
 *     _data:[]
 *     _channelData[numberOfChannels]
 * }
 */
async function decodeFromBuffer(buffer){
    return decode(buffer, (err, audioBuffer) => {
        return audioBuffer
    });
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
        signal = openUnmix.preProcessing(signal, specParams)
        //Perform post processing (ISTFT)
        let ISTFTResult = openUnmix.istft(signal, specParams, 1.0);
        let posProcessed = tf.tensor1d(ISTFTResult)
        posProcessed = openUnmix.padSignal(posProcessed, specParams, false).arraySync();
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
            signal = openUnmix.preProcessing(signal, specParams)

            //Perform post processing (ISTFT)
            let ISTFTResult = openUnmix.istft(signal, specParams, 1.0);

            let posProcessed = tf.tensor1d(ISTFTResult)

            posProcessed = openUnmix.padSignal(posProcessed, specParams, false).arraySync();
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
            signal = openUnmix.preProcessing(signal, specParams)

            //Perform post processing (ISTFT)
            let ISTFTResult = openUnmix.istft(signal, specParams, 1.0);

            let posProcessed = tf.tensor1d(ISTFTResult)

            posProcessed = openUnmix.padSignal(posProcessed, specParams, false).arraySync();
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
        it.skip('sine wave size 2^'+pow, async function() {
            signal = generateSineWave(pow)
            console.time('test');
            await openUnmix.loadModel(config.model.url)
            await openUnmix.modelProcess(config.model.url, signal, signal)
            console.timeEnd('test');
            signal = []
            //done();
        });
    }

    for (let i in provider) {
        makeTestModelSine(provider[i]);
    }

    it('should return only the voice when using the model', async function(done) {
        this.timeout(0);
        let decodedFile = await decodeFile(AUDIO_PATH)
        let decodedFromBuffer = await decodeFromBuffer(decodedFile)

        await openUnmix.loadModel(config.model.url)

        let buff = await openUnmix.modelProcess(config.model.url, decodedFromBuffer._channelData[0], decodedFromBuffer._channelData[1])

        openUnmix.createWave(buff, "testE2.wav")

    });

});


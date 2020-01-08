const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const decode = require('audio-decode');

const FRAME_LENGTH = 4096 // patch length?
const FRAME_STEP = 1024

function readFile(file) {
    let arrayBuffer = fs.readFileSync(file);
    decodeFile(file, arrayBuffer)
}

function decodeFile(fileName, arrayBuffer) {
    decode(arrayBuffer, (err, audioBuffer) => {
        try {
            console.log(audioBuffer.duration)
            const input = tf.tensor1d(audioBuffer._channelData[0])

            //TensorflowJs STFT
            tf.signal.stft(input, FRAME_LENGTH, FRAME_STEP).print();

        } catch (e) {
            console.log(e)
            throw e;
        }
    });
}

readFile('audio_example.mp3')


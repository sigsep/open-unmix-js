//let wav = require('node-wav');
//var shortTimeFT = require('stft'); //(1, 4096, onFreq); //4096 = FFT_SIZE

const FFT_SIZE = 4096; // Frame length?
const PATCH_LENGTH = 512; // Frame step? In py = 1024?
const HOP_SIZE = 1024; //
const SR = 44100; // Sampling rate

const STFT = require("stft")

function readFile(file) {
    const reader = new FileReader();
    reader.onerror = function() {
        console.log('An error occurred when reading the file. Code: ' + reader.error.code); 
    };

    reader.onload = function() {
        const arrayBuffer = reader.result; 
        console.log(file.name + "The file was loaded sucessfully. Decoding..."); 
        decode(file.name, arrayBuffer);
    };

    reader.readAsArrayBuffer(file);
}

function decode(fileName, arrayBuffer) {
    const audioCtx = new AudioContext({"sampleRate":SR});
    audioCtx.decodeAudioData(arrayBuffer,
        function(decodedData) {
            const source = audioCtx.createBufferSource();
            source.buffer = decodedData;
            if (source.buffer.numberOfChannels != 2) {
                console.log("Only stereo data is supported.");
                return;
            }

            resample(fileName, source);
        },
        function(e) {
            console.log("An error occurred during decoding. The browser may not support the file format. Try converting to another format. :" + e.name + " " + e.message);
        });
}

function resample(fileName, input){
    console.log(fileName)
    console.log(input)

    var stft = STFT(1, FFT_SIZE, onfft)
   
   
    function onfft(re, im) {
      console.log("real: " + re)
      console.log("imaginary: " + im)
    }

    //apply on sampling? 
    for(var i=0; i+FFT_SIZE<=input.length; i+=FFT_SIZE) {
        stft(input.subarray(i, i+FFT_SIZE))
    }
}
let blob = window.URL || window.webkitURL;
if (!blob) {
    console.log('Your browser does not support Blob URLs :(');       
}

const input = document.getElementById("audioFile");

input.addEventListener("change", function () {
    let file = this.files[0],
    fileURL = blob.createObjectURL(file);
    ogAudio = document.getElementById('ogAudio')
    ogAudio.src = fileURL;
    ogAudio.pause()
    // do the same thing as Koekestra
    console.log(typeof fileURL)
    readFile(file)
});

// Mikola's test
function stftPassThru(frame_size, input) {
    var stft = STFT(1, frame_size, onfft)
    var istft = STFT(-1, frame_size, onifft)
    var output = new Float32Array(input.length)
    var in_ptr = 0
    var out_ptr = 0
   
    function onfft(re, im) {
      console.log("real: " + re)
      console.log("imaginary: " + im)
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
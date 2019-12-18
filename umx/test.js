var stftLib = require("stft")
const mse = require('mse');

function stftPassThru(frame_size, input) {
  var stft = stftLib(1, frame_size, onfft)
  var istft = stftLib(-1, frame_size, onifft)
  var output = new Float32Array(input.length)
  var in_ptr = 0
  var out_ptr = 0
  let called_istf = 0
  let called_onfft = 0
 
  function onfft(x, y) {
    called_onfft += 1
    istft(x, y)
  }
  
  function onifft(v) {
    called_istf += 1
    for(var i=0; i<v.length; ++i) {
      output[out_ptr++] = v[i]
    }
  }
  
  for(var i=0; i+frame_size<=input.length; i+=frame_size) {
    stft(input.subarray(i, i+frame_size))
  }
  console.log('called onfft: ' + called_onfft + " times")
  console.log('called istf: ' + called_istf + " times")
  return output
}
/*-------------------------------------------------------------------------------------------------------------------------------------------------*/
function inverseSTFT(frame_size, re, im){
    console.log("input size (re): " + re.length)
    console.log("input size (im): " + im.length)
    // try doubling up the array because the output is symetrical? 
    let d_re = new Float32Array(re.length * 2)
    let d_im = new Float32Array(re.length * 2)
    for(let i=0; i < re.length; i++){
      d_re[i] = re[i]
      d_re[i+re.length] = re[i]
    }
    for(let i=0; i < im.length; i++){
      d_im[i] = im[i]
      d_im[i+im.length] = im[i]
    }
    
    // loading the library
    var istft = stftLib(-1, frame_size, onTime)

    var output = new Float32Array(re.length)
    var out_ptr = 0
   
    // counting the times the callback function was called
    let called_time = 0

    function onTime(v) {
      called_time++
      for(var i=0; i<v.length; ++i) {
        output[out_ptr++] = v[i]
      }
    }
    
    console.log("input size (re): " + re.length)
    console.log("input size (im): " + im.length)
    
    // iterate through the input
    for(var i=0; i+frame_size<=(d_re.length); i+=frame_size) {
      istft(d_re.subarray(i, i+frame_size), d_im.subarray(i, i+frame_size))
    }
    
    console.log('called onTime: ' + called_time + " times")
    return output
}

function STFT(frame_size, input) {
    var stft = stftLib(1, frame_size, onFreq)

    let re_ptr = 0
    let im_ptr = 0

    let re_output = new Float32Array(input.length)
    let im_output = new Float32Array(input.length)

    let called_freq = 0
    function onFreq(re, im) {
        called_freq++
        for(let i=0; i<re.length; ++i) {
            re_output[re_ptr++] = re[i]
        }
        for(let i=0; i<im.length; ++i) {
            im_output[im_ptr++] = im[i]
        }
    }   


    for(var i=0; i+frame_size<=input.length; i+=frame_size) {
      console.log("i: " + i, "n: " + input.length)
      stft(input.subarray(i, i+frame_size))
    }

    //stft(new Float32Array(frame_size))
    output = [re_output, im_output]
    console.log("called onFreq: " + called_freq + " times")
    return output
}

let testarr = new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])


let ogSTFT = stftPassThru(8, testarr)
let forward = STFT(8, testarr)
console.log("ogSTFT: "+ogSTFT)

let result = mse(testarr, ogSTFT); // results in a calcuation of 5.3125 
console.log('OGStft ang og data sets are different by ' + result);


console.log('\nForward stft: '+ forward)


let copy_result_stft = [...forward]
let inverse = inverseSTFT(8, copy_result_stft[0], copy_result_stft[1])

console.log('\nInverse STFT: ' + inverse)

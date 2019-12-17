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
    //console.log('x: ' + x, " y: " + y)  
    called_onfft += 1
    istft(x, y)
  }
  
  function onifft(v) {
    //console.log(Array.prototype.slice.call(v))
    //console.log('v: ' + v)
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
    var istft = stftLib(-1, frame_size, onTime)
    var output = new Float32Array(re.length)
    var out_ptr = 0
    let length = 0
    let called_time = 0
    function onTime(v) {
      called_time++
      console.log("\nframe " + length++)
      for(var i=0; i<v.length; ++i) {
        console.log("v: " + v[i])
        output[out_ptr++] = v[i]
      }
    }
    
    //console.log("\nframe size: " + frame_size)
    //console.log("\nre: " + re)
    //console.log("\nim: "+im)  
    console.log("input size (re): " + re.length)
    console.log("input size (im): " + im.length)
    let hop_size = frame_size >>> 2
    for(var i=0; i+frame_size<=(re.length); i+=hop_size) {
      console.log("i: " + i, "n: " + re.length)
      istft(re.subarray(i, i+frame_size), im.subarray(i, i+frame_size))
      //console.log("AaaAa")
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


    console.log("input size: " + input.length)
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


let thing = stftPassThru(8, testarr)
let thing1 = STFT(8, testarr)
console.log(thing)

let result = mse(testarr, thing); // results in a calcuation of 5.3125 
//console.log('data sets are different by ' + result);


//console.log('\nstft: '+thing1)
//console.log("\nre: " + thing1[0])
//console.log("\nim: " + thing1[1])

let a = [...thing1]
let thing2 = inverseSTFT(8, a[0], a[1])

//console.log('stft pass through: '+thing)

console.log('\ninverse STFT: ' + thing2)


//let thing4_re = new Float32Array(24)
//stftLib(1, 24, (data) => {console.log(data)})(new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))

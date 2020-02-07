/* eslint-disable */
const FRAME_LENGTH = 2048
const HOP_LENGTH = 1024
const NFFT = 2048
const SAMPLE_RATE = 44100
const PATCH_LENGTH = 256


const FREQUENCES = 1025 //2049
const FRAMES = 256 //100
const N_CHANNELS = 2
const N_BATCHES = 1
const PADDING = 8 // Padding for model prediction
/**
 * Insert zeros in the beginning and end of signal
 * to recreate exactly the original song
 * @param signal
 * @param processedLength
 * @param originalLength
 * @param specParams
 */
function insertZeros(signal, processedLength, originalLength, specParams){
    let diff = processedLength - originalLength
    let padDiff = new Float32Array(specParams.fftLength + 208) // 208 magic number
    let padDiffEnd = new Float32Array(176) //176 is a magic number
    //Insert zeros in front of processed signal to be as exact size as the original one
    return signal = [...padDiff, ...signal, ...padDiffEnd]
}

/**
 *
 * @param path
 * @param resultSTFT
 * @param specParams
 * @returns {Promise<[][]>}
 */
async function loadAndPredict(path, resultSTFT, specParams){ //Update this
    // model load
    // const model = await tf.node.loadSavedModel(pb_path);
    const model = await tf.loadGraphModel(path_);
    let result = [[],[]]

    let number_of_frames = resultSTFT[0].shape[0]

    //Fill with zeros
    if(number_of_frames < FRAMES){
        let fillZeros = FRAMES - number_of_frames
        let pad =tf.zeros([fillZeros,FREQUENCES], 'complex64')
        resultSTFT[0] = tf.concat([pad,resultSTFT[0]])
        resultSTFT[1] = tf.concat([pad,resultSTFT[1]])
    }
    //for(let i = 0; i < (number_of_frames - (number_of_frames % (FRAMES-PADDING))) ; i+=(FRAMES-PADDING)){
    //for(let i = 0; i < (number_of_frames - (number_of_frames % FRAMES)) ; i+= FRAMES){
        let input = createInput(resultSTFT[0], resultSTFT[1], 0)
        // prediction
        const output = tf.tidy(() => {
            return model.predict(input["model_input"]);
            // let paddedPredict = model.predict(input["model_input"]);
            // return paddedPredict.slice([(PADDING/2), 0, 0, 0],[(FRAMES-PADDING), 1, 2, FREQUENCES])
        })

        // Used in normal tensorflow
        //const output = await model.predict(input["model_input"]);

        // const estimateReshaped = tf.tidy(() => {
        //     let mix_angle = input["mix_angle"].slice([PADDING/2, 0, 0, 0],[(FRAMES-PADDING), 1, 2, FREQUENCES])
        //
        //     let result = tf.mul(tf.complex(output, tf.zeros([FRAMES-PADDING, N_BATCHES, N_CHANNELS, FREQUENCES])),
        //         tf.exp(tf.complex(tf.zeros([FRAMES-PADDING, N_BATCHES, N_CHANNELS, FREQUENCES]), mix_angle)))
        //     // Reshaping to separate channels and remove "batch" dimension, so we can compute the istft
        //     return result.unstack(2).map(tensor => tensor.squeeze())
        // });
        //
        // let res0 = istft(estimateReshaped[0], ispecParams)
        // let res1 = istft(estimateReshaped[1], ispecParams)

        let estimate = tf.mul(tf.complex(output, tf.zeros([FRAMES, N_BATCHES, N_CHANNELS, FREQUENCES])),
            tf.exp(tf.complex(tf.zeros([FRAMES, N_BATCHES, N_CHANNELS, FREQUENCES]), input["mix_angle"])))

        // Reshaping to separate channels and remove "batch" dimension, so we can compute the istft
        let estimateReshaped = estimate.unstack(2).map(tensor => tensor.squeeze()) // Tensor[]

        let res0 = postProcessing(estimateReshaped[0], specParams, 1.0)
        let res1 = postProcessing(estimateReshaped[1], specParams, 1.0)
        //

        // Push into result 2 channels
        result = [[...result[0],...res0], [...result[1],...res1]]

    //}

    return result;
}

/**
 *  A function that applies TF's STFT to a single Float32Array (a channel)
 * @param {*} channel
 * @param specParams
 * @returns A Float32Array that should be similar to the original channel
 */
function preProcessing(channel, specParams){
    let input = tf.tensor1d(channel, "float32");

    // Pad the signal for soft beginning
    input = padSignal(input, specParams, true);

    // Perform stft
    let resultSTFT = tf.signal.stft(
        input,
        specParams.winLength,
        specParams.hopLength,
        specParams.fftLength
    );

    if (DEBUG) console.log("Shape after STFT: ", resultSTFT.shape)

    return resultSTFT
}

/**
 * Pad the signal for song soft beginning
 * @param signal
 * @param specParams
 * @param forward insert or remove pad
 * @returns Float32Array with padded signal
 */
function padSignal(signal, specParams, forward){
    let pad = 2 * (specParams.fftLength - specParams.hopLength)
    pad = Math.floor(pad/2)
    //Insert padding
    if(forward){
        signal = tf.pad(signal, [[pad, pad]])
        if (DEBUG) console.log("[Preprocessing] Size after padding: " + signal.shape)
        return signal
    }else{
        signal = tf.slice(signal, [pad], [(signal.shape - pad)])
        if (DEBUG) console.log("[Postprocessing] Size after padding: " + signal.shape)
        return signal
    }

}


/**
 *
 * @param input
 * @param specParams
 * @param factor
 * @returns {Float32Array}
 */
function postProcessing(input, specParams, factor){
    let resultISTFT = istft(input, specParams, factor);
    if (DEBUG) console.log("Shape after ISTFT: ", resultISTFT.length)
    let signal = tf.tensor1d(resultISTFT)
    signal = padSignal(signal, specParams, false)

    // let resultMSE = mse(resultISTFT.slice(0, channel.length-1), channel);
    // console.log('Channel data sets are different by ' + resultMSE);

    return signal.arraySync()
}

/**
 * Creates input to the model
 * @param res0
 * @param res1
 * @param slice_start
 * @returns {{mix_angle: *, model_input: *}}
 */
function createInput(res0, res1, slice_start){
    let absChannel0 = tf.abs(res0).slice([slice_start,0], [FRAMES, FREQUENCES])
    let absChannel1 = tf.abs(res1).slice([slice_start,0], [FRAMES, FREQUENCES])
    const model_input = tf.stack([absChannel0, absChannel1]).transpose([1, 0, 2]).expandDims(1)

    let chan0 = res0.slice([slice_start,0], [FRAMES, FREQUENCES])
    let chan1 = res1.slice([slice_start,0], [FRAMES, FREQUENCES])

    const mix_stft = tf.stack([chan0, chan1]).transpose([1, 0, 2]).expandDims(1)
    let mix_angle = tf.atan2(tf.imag(mix_stft), tf.real(mix_stft))
    return {"model_input":model_input, "mix_angle":mix_angle}

    // let pad =tf.zeros([PADDING,FREQUENCES], 'complex64')
    //
    // let paddedRes0 = tf.concat([pad,res0.slice([slice_start,0], [FRAMES-PADDING, FREQUENCES]),pad])
    // let paddedRes1 = tf.concat([pad,res1.slice([slice_start,0], [FRAMES-PADDING, FREQUENCES]),pad])
    //
    // const model_input = tf.tidy(() => {
    //     let absChannel0 = tf.abs(paddedRes0)
    //     let absChannel1 = tf.abs(paddedRes1)
    //     return tf.stack([absChannel0, absChannel1]).transpose([1, 0, 2]).expandDims(1)
    // });
    //
    // const mix_stft = tf.tidy(() => {
    //     return tf.stack([res0, res1]).transpose([1, 0, 2]).expandDims(1)
    //     // return tf.stack([paddedRes0, paddedRes1]).transpose([1, 0, 2]).expandDims(1)
    // })
    //
    // const mix_angle = tf.tidy(() => {
    //     return tf.atan2(tf.imag(mix_stft), tf.real(mix_stft))
    // });
    //
    // mix_stft.dispose()
    // pad.dispose()
    // paddedRes0.dispose()
    // paddedRes1.dispose()
    // return {"model_input":model_input, "mix_angle":mix_angle}
}

/**
 *
 * @param data Float32Array
 * @param padding number | number[]
 * @returns {Float32Array}
 */
function padConstant(data, padding) {
    let padLeft, padRight;
    if (typeof (padding) === 'object') {
        [padLeft, padRight] = padding;
    } else {
        padLeft = padRight = padding;
    }
    const out = new Float32Array(data.length + padLeft + padRight);
    out.set(data, padLeft);
    return out;
}

/**
 *
 * @param data Float32Array
 * @param length number
 * @returns {Float32Array}
 */
function padCenterToLength(data, length) {
    // If data is longer than length, error!
    if (data.length > length) {
        throw new Error('Data ' + data.length + 'is longer than length ' + length);
    }
    const paddingLeft = Math.floor((length - data.length) / 2);
    const paddingRight = length - data.length - paddingLeft;
    return padConstant(data, [paddingLeft, paddingRight]);
}

/**
 *
 * @param complex output of STFT
 * @param params Parameters for computing a inverse spectrogram from audio.
 * @param factor adjust normalization factor
 *
 params {
    hopLength?: number;
    winLength?: number;
    nFft?: number;
   }
 * @returns {Float32Array} reconstructed signal
 */
function istft(complex, params, factor) {
    const winFactor = factor || 1.0;
    const nFrames = complex.shape[0];
    const nFft = params.nFft || enclosingPowerOfTwo(complex.shape[1]);
    const winLength = params.winLength || nFft;
    const hopLength = params.hopLength || Math.floor(winLength / 4);

    // Pad the window to be the size of nFft. Only if nFft != winLength.
    // In our case we dont need to pad since nFfft != winLength (always)
    if(nFft !== winLength){
        let ifftWindow = ifftWindowTF.arraySync();
        ifftWindow = padCenterToLength(ifftWindow, nFft);
        ifftWindowTF = tf.tensor1d(ifftWindow)
    }

    // Compute output expected signal length
    const expectedSignalLen = nFft + hopLength * (nFrames - 1);

    const istftResult = new Float32Array(expectedSignalLen);

    // Perform inverse ffts
    let irfftTF = complex.irfft()

    // Adjust normalization for 2096/1024 (factor of 1.0 with stft/istft)
    // used by the model
    let normalizationFactor = tf.mul(ifftWindowTF, tf.tensor(winFactor));

    // Apply squared window
    let res = tf.mul(irfftTF, normalizationFactor).arraySync();

    // Overlap and add function (adds potentially overlapping frames of a signal)
    for(let i = 0; i < nFrames; i++){
        let sample = i * hopLength;
        let yTmp = res[i];
        yTmp = add(yTmp, istftResult.slice(sample, sample + nFft));
        istftResult.set(yTmp, sample);
    }

    return istftResult
}

/**
 *
 * @param frame_step
 * @param frame_length
 * @param forward_window_fn
 * @returns {Tensor}
 */
function inverse_stft_window_fn(frame_step, frame_length, forward_window_fn = (f) => tf.hannWindow(f)){
    const forward_window = forward_window_fn(frame_length)
    let denom = tf.square(forward_window)
    const overlaps = Math.ceil(frame_length/frame_step) // -(-frame_length / frame_step) but js
    denom = tf.pad(denom, [[0, overlaps * frame_step - frame_length]])
    denom =  denom.reshape([overlaps, frame_step])
    denom = tf.sum(denom, 0, keepdims=true)
    denom = tf.tile(denom, [overlaps, 1])
    denom = denom.reshape([overlaps * frame_step])
    return tf.div(forward_window, denom.slice(0, frame_length))//forward_window / denom.slice(0, frame_length)
}

/**
 * Return 2**N for integer N such that 2**N >= value.
 * @param value
 * @returns {number} smallest power of 2 enclosing
 */
function enclosingPowerOfTwo(value) {
    return Math.floor(Math.pow(2, Math.ceil(Math.log(value) / Math.log(2.0))));
}

/**
 * Add two arrays
 * @param arr0
 * @param arr1
 * @returns {Float32Array|null}
 */
function add(arr0, arr1) {
    if (arr0.length !== arr1.length) {
        console.error(
            `Array lengths must be equal to add: ${arr0.length}, ${arr1.length}`);
        return null;
    }
    const out = new Float32Array(arr0.length);
    for (let i = 0; i < arr0.length; i++) {
        out[i] = arr0[i] + arr1[i];
    }
    return out;
}


//TODO: Verify if the song has SR = 44100 and 2 channels
function readFile(file){ // Maybe rename this to be different from japanese guy? 
    const fileReader =  FileReader()
    fileReader.onError = function(){ console.log("Error when reading the file") }
    fileReader.onLoad = function(){
        return decodeFile(file.name, fileReader.result)
    }

    return ReadableStreamReader.readAsArrayBuffer(file)
}

function decodeFile(fileName, arrBuffer){
    const audioContext = new AudioContext({"sampleRate":SAMPLE_RATE})
    audioContext.decodeAudioData(arrBuffer,
            function(data){
                const source = audioContext.createBufferSource()
                source.buffer = data
                return source
            }
    , () => {console.log("Error on decoding audio context")})


}

function process(file){
   let arr =  readFile(file)
   console.log(arr)

}


export {process}
/* eslint-enable */

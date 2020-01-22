
const tf = require('@tensorflow/tfjs-node');
//const MODEL_2_STEMS = 'https://raw.githubusercontent.com/shoegazerstella/spleeter_saved_models/master/saved_models_js/2stems/model.json'

const path = '../model/'

const audio_id = tf.tensor("")
const mix_spectogram = tf.randomNormal([1, 512, 1024, 2])
const mix_stft_real = tf.randomNormal([512, 2049, 2])
const mix_stft_img = tf.randomNormal([512, 2049, 2])
const mix_stft = tf.complex(mix_stft_real, mix_stft_img)
const waveform = tf.randomNormal([524288, 2])

const modelInput = {"Placeholder_1": audio_id,"strided_slice_3":mix_spectogram, "transpose_1": mix_stft, "Placeholder":waveform}



tf.node.getMetaGraphsFromSavedModel(path)
    .then(modelInfo => {
        console.log('modelInfo', modelInfo)
        console.log('tags', modelInfo[0].tags)
        console.log('signatureDefs', modelInfo[0].signatureDefs)
    })
    .catch(error => {
      console.error(error.stack);
    });

// model load
// const model = await tf.node.loadSavedModel(path);

// // prediction
// const output = model.predict(input);

// loadModel(modelInput).catch(err => console.log(err))  

// async function loadModel(modelInput) {

//     const modelUrl = MODEL_2_STEMS;
//     console.log("loading model")
//     spleeterModel = await tf.loadGraphModel(modelUrl);
//     //console.log(spleeterModel)
//     //console.log(modelInput)
//     console.log("predicting")
//     let a =  await spleeterModel.executeAsync(modelInput)
//     a.print(true)
//     console.log("finish")
//}
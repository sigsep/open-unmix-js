//https://github.com/tensorflow/tfjs-examples/blob/master/firebase-object-detection-node/functions/index.js
const tf = require('@tensorflow/tfjs-node');

const MODEL_2_STEMS = 'https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224/model.json'
async function loadModel() {

  const modelUrl = MODEL_2_STEMS;
    const spleeterModel = await tf.loadGraphModel(modelUrl);
    const zeros = tf.zeros([1, 224, 224, 3])
    spleeterModel.predict(zeros).print()
}


loadModel()
  .catch(err => console.log(err))  

console.log("")
      

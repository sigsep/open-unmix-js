
const tf = require('@tensorflow/tfjs-node');

const path = '../model/'

const input = tf.randomNormal([100, 1, 2, 2049])

a()

async function a(){
// model load
const model = await tf.node.loadSavedModel(path);

// prediction
const output = model.predict(input);
console.log(output)
}



const tf = require('@tensorflow/tfjs-node');

const path = './vocals'

/**
 * 100 batches
 * 1 sample/batch
 * 2 channels
 * 2049 frequencies
 * @type {Tensor<Rank>}
 */
const input = tf.randomNormal([100, 1, 2, 2049])


load(path)

async function load(path){
// model load
const model = await tf.node.loadSavedModel(path);

// prediction
const output = model.predict(input);
console.log(output)
}


import {modelProcess, loadModel} from 'open-unmix-js'

export const computeStems = async(input) => {
  await loadModel(input.modelUrl);
  let result = await modelProcess(input.decodedFiles[0], input.decodedFiles[1])
  let trackstoload = []
  for (let stem of result.stems) {
    trackstoload.push(
    { 'name': stem.name,
      'customClass': stem.name,
      'solo': false,
      'mute': false,
      'src': stem.data
    });
  }
  return trackstoload;  
}
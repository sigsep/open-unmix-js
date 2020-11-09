const SAMPLE_RATE = 44100



function readFile(file, setVal){
    const fileReader = new FileReader()
    fileReader.onerror = function(){ console.log("Error when reading the file") }
    fileReader.onload = function(file){
        decodeFile(file.name, fileReader.result).then(a => {
            setVal.push(a.getChannelData(0), a.getChannelData(1))
        })
    }
    fileReader.readAsArrayBuffer(file)
}

function decodeFile(fileName, arrBuffer){
    const audioContext = new AudioContext({"sampleRate":SAMPLE_RATE})
    return audioContext.decodeAudioData(arrBuffer,
        function (data) {
            const source = audioContext.createBufferSource()
            source.buffer = data
            if (source.buffer.sampleRate !== SAMPLE_RATE || source.buffer.numberOfChannels !== 2) {
                console.log(source.buffer.sampleRate, source.buffer.numberOfChannelst)
                alert("Sorry, we can oly process songs with a 44100 sample rate and 2 channels")
                throw new Error('Cannot process song')
            }

            console.log("Returning decoded files..")
            return [source.buffer.getChannelData(0), source.buffer.getChannelData(1)]
            // return [source.buffer.getChannelData(0), source.buffer.getChannelData(1)]
        }
        , () => {
            console.log("Error on decoding audio context")
        })
}


export {readFile}

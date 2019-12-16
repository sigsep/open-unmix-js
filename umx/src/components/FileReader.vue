<template>
  <div class="hello">
    <input type="file" id="audioFile" @change="loadFile">
    <h3>Pre-preprocessing audio</h3>
    <audio id="ogAudio" controls></audio>
  </div>
</template>

<script>
export default {
  name: 'FileReader',

  methods: {
    loadFile () {
      let blob = window.URL || window.webkitURL
      let file = document.getElementById('audioFile').files[0]
      let fileURL = blob.createObjectURL(file)
      let ogAudio = document.getElementById('ogAudio') // is... this.. how you do this in Vue? I dont think so
      ogAudio.src = fileURL
    },

    readFile(file) {
      const reader = new FileReader();
      reader.onerror = function() {
          console.log('An error occurred when reading the file. Code: ' + reader.error.code) 
      };

      reader.onload = function() {
          const arrayBuffer = reader.result; 
          console.log(file.name + "The file was loaded sucessfully. Decoding...")
          decode(file.name, arrayBuffer);
      };

      reader.readAsArrayBuffer(file)
    }

  }

}
// Read file
// Load audio
// Pre-process...

</script>

<template>
  <div class="hello">
    <input type="file" id="audioFile" @change="readFile">
    <h3>Pre-preprocessing audio</h3>
    <audio id="ogAudio" controls></audio>
  </div>
</template>

<script>
export default {
  name: 'FileReader',

  methods: {
    readFile () {
      let blob = window.URL || window.webkitURL;
      let file = this.files[0]
      let fileURL = blob.createObjectURL(file);
      let ogAudio = document.getElementById('ogAudio') // is... this.. how you do this in Vue? I dont think so 
      ogAudio.src = fileURL;
      // do the same thing as Koekestra
      console.log(typeof fileURL)
      console.log("test")
      //readFile(file)
    }
}

}
// Read file
// Load audio
// Pre-process...

</script>

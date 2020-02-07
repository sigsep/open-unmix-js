<template>
  <v-app id='app' :dark="dark">
  <v-container>
  <vue-dropzone 
      id="drop" 
      :options="dropOptions"
      @vdropzone-file-added="renderAudioTag"
      @vdropzone-complete="loadFile"
    ></vue-dropzone>
  
    <div v-if="shouldRenderSong">
      <!-- <vue-wave-surfer :src="file" :options="waveSurferOptions"></vue-wave-surfer> -->
      <audio ref="ogAudio" controls>
        <p>Your browser does not have the <code>audio</code> tag</p>
      </audio>

      <button @click="processSong">Process song</button>
    </div>
     <v-card
      v-if="shouldRenderPlayer"
      max-width="900"
      class="mx-auto"
      color="dark-grey"
      dark
    >
      <Player :key="combKey" ref="player" :urls="tracklist" :conf="playerconf"></Player>
    </v-card>

  </v-container>    
  </v-app>
</template>
<script>
import vueDropzone from "vue2-dropzone";
import Player from './../components/Player.vue'
import axios from 'axios'
import {readFile, modelProcess} from './../lib/umx.js'

// import VueWaveSurfer from 'vue-wave-surfer' //remember to put it in components again

export default {
  name: 'Home',
  components: { Player, vueDropzone },
  data () {
    return {
      dropOptions: {
        url: "https://httpbin.org/post",
        maxFilesize: 5, // MB
        maxFiles: 1,
        addRemoveLinks: true
      },
      waveSurferOptions: {

      },
     
      shouldRenderPlayer: false,
      shouldRenderSong: false,
       dark: false,
      player: null,
      combKey: 42,
      showPlayer: false,
      playerconf: {
        title: "",
        zoom: 1024,
        dark: true,
        streams: [
          // { 
          //   name: "vocals",
          //   url: "https://dl.dropboxusercontent.com/s/70r7pym621ayoe8/vocals.m4a",
          //   color: "#000000"
          // },
          // { 
          //   name: "drums",
          //   url: "https://dl.dropboxusercontent.com/s/7dc94n728l9qm5t/drums.m4a",
          //   color: "#48bd75"
          // },
          ]
      },
      publicPath: process.env.BASE_URL,
      trackstoload: [],
      tracklist: []
    }
  },
  mounted: function () {
  
  },
  created: function () {
    
  },
  methods: {
    /* eslint-disable */
    renderAudioTag(file){
       this.shouldRenderSong = true
    },
    /* eslint-enable */

    loadFile: function(file) {
      let blob = window.URL || window.webkitURL;
      readFile(file)
      this.$refs.ogAudio.src =  blob.createObjectURL(file);; 
      this.playerconf.title = file.name
    },

    processSong(){
      
      modelProcess(this.publicPath).then((song) => 
        {
          console.log(song)
          this.shouldRenderPlayer = true
          this.combKey = Math.ceil(Math.random() * 10000)
          let blob = window.URL || window.webkitURL;
          let trackstoload = []
          //for (let stem of this.playerconf.streams) {
            trackstoload.push(
                { 'name': "vocals",//stem.name,
                  'customClass': "vocals",//stem.name,
                  'solo': false,
                  'mute': false,
                  'src': blob.createObjectURL(song)//stem.url
              })
          //}
          this.tracklist = trackstoload}
      )
      
    }
  },
  computed: {
  
  }

}
</script>

<style lang="stylus">
#app {
   height: 100vh;
}
 #drop {
    height: 200px;
    padding: 40px;
    color: white;
    background: lightblue;
}

#drop .dz-success-mark, .dz-error-mark {
    display: none;
  }

.select {
  z-index: 1000
}
</style>
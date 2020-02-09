<template>
  <v-app id='app' :dark="dark">
  <v-container >

      <vue-dropzone
        id="drop"
        :options="dropOptions"
        @vdropzone-file-added="renderAudioTag"
        @vdropzone-complete="loadFile"
        v-if="shouldRenderDropzone"
      ></vue-dropzone>

    <div v-if=" shouldRenderSong">
        <audio ref="ogAudio" controls>
          <p>Your browser does not have the <code>audio</code> tag</p>
        </audio>


        <v-btn
          color="secondary"
          v-on:click="processSong"
          ref="processButton"
          disabled
          block
          >
            Process Song
        </v-btn>

    </div>

    <div v-if="shouldRenderPlayer">
      <v-card
        max-width="900"
        class="mx-auto"
        color="dark-grey"
        dark
      >
        <Player :key="combKey" ref="player" :urls="tracklist" :conf="playerconf"></Player>
      </v-card>
        <div id="center">
            <div id="left">
            <v-btn
              color="primary"
              v-on:click="download('vocals')"
              >
                Download vocals
            </v-btn>

            </div>
            <div id="right">
            <v-btn
              color="primary"
              v-on:click="download('back')"
              >
                Download Background track
            </v-btn>
            </div>
        </div>
    </div>

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
        maxFiles: 1
      },
      shouldRenderPlayer: false,
      shouldRenderSong: false,
      shouldRenderDropzone:true,
      dark: false,
      player: null,
      combKey: 42,
      showPlayer: false,
      playerconf: {
        title: "",
        zoom: 1024,
        dark: true,
        streams: []
      },
      publicPath: process.env.BASE_URL,
      trackstoload: [],
      tracklist: [],
      fileName:""
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
      this.$refs.ogAudio.src =  blob.createObjectURL(file)
      this.playerconf.title = file.name;
      this.fileName = file.name.substr(0, file.name.lastIndexOf('.'));
      this.$refs.processButton.disabled = false
    },

    async processSong(){
      this.$refs.processButton.loading = true
      modelProcess(this.publicPath).then((result) =>
        {
          this.shouldRenderSong = false
          this.shouldRenderDropzone = false
          this.shouldRenderPlayer = true
          this.combKey = Math.ceil(Math.random() * 10000)
          let blob = window.URL || window.webkitURL;
          let trackstoload = []
          for (let stem of result.stems) {
            trackstoload.push(
                { 'name': stem.name,
                  'customClass': stem.name,
                  'solo': false,
                  'mute': false,
                  'src': stem.data
              })
          }
          this.tracklist = trackstoload
          }

      )

    },

    download(track){
      let t = 0
      if(track == 'back') t = 1
      console.log(this.tracklist[0].src)
      const link = document.createElement('a')
      link.href = URL.createObjectURL(this.tracklist[t].src)
      link.download = this.fileName+"_"+track+".wav"
      link.click()
      URL.revokeObjectURL( link.href);
      link.remove();
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
    text-align: center;
    background: #303030;
}


#drop .dz-success-mark, .dz-error-mark {
    display: none;
  }

.select {
  z-index: 1000
}


#center {
    align: center;
    padding: 1%;
    margin: 0 auto;
    border-spacing: 10%;
    justify-content: space-between;
    display: flex;
}

#left {
    margin-left: 10%;
}

#right {
    margin-right: 10%;
}
</style>

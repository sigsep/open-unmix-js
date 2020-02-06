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

      <button @click="process">Process song</button>
    </div>

    <div v-if="shouldRenderPlayer">
      <v-row no-gutters>
          <v-select v-if="tracks.length > 1"
            :dark="dark"
            v-model="selectedTrack"
            class="select"
            :items="tracks"
            light
            label="Select track to separate"
          ></v-select>
        <Player :ref="player" :urls="tracklist" :dark="dark"></Player>
        <v-layout
          align-center
          justify-center
          style="background: red;"
        >
        </v-layout>
      </v-row>
    </div>

  </v-container>    
  </v-app>
</template>

<script>
import vueDropzone from "vue2-dropzone";
import Player from './../components/Player.vue'
import axios from 'axios'
import {foo} from './../lib/a.js'
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
        //chunking: true,
        //chunkSize: 500, // Bytes
        //thumbnailWidth: 150, // px
        //thumbnailHeight: 150,
        addRemoveLinks: true
      },
      waveSurferOptions: {

      },
      fileURL: "",
      dark: false,
      tracks: [],
      stems: [],
      selectedTrack: '',
      baseUrl: process.env.BASE_URL,
      shouldRenderPlayer: false,
      shouldRenderSong: false
    }
  },
  mounted: function () {
    this.fetchData();
  },
  created: function () {
    
  },
  methods: {
    fetchData(){
     axios.get(this.baseUrl + 'headers.json').then(response => {
        this.tracks = response.data.tracks
        this.stems = response.data.stems
        this.selectedTrack = response.data.selected_track
        this.dark = response.data.dark
     })
    },
    /* eslint-disable */
    renderAudioTag(file){
       this.shouldRenderSong = true
    },
    /* eslint-enable */

    loadFile: function(file) {
      let blob = window.URL || window.webkitURL;
      this.fileURL = blob.createObjectURL(file);   
      this.$refs.ogAudio.src = this.fileURL
     
    },

    process(){
     
      foo("foo")
     
    }
  },
  computed: {
    tracklist: function () {
      var trackstoload = []
      for (let stem of this.stems) {
        trackstoload.push(
            { 'name': stem,
              'customClass': stem,
              'solo': false,
              'mute': false,
              'src': [
                'tracks', this.selectedTrack, stem
              ].join('/') + '.m4a'
          })
      }
      return trackstoload
    }
  }

}
</script>

<style lang="stylus">
#app {
   height: 100vh;
}

.select {
  z-index: 1000
}
</style>
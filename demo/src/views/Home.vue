<template>

    <v-app id='app' :dark="dark">
        <vue-headful
                title="SigSep"
                description="Open Resources for Music Source Separation"
        />
        <head><title>My Vue.js app</title></head>
        <header bg fill-height grid-list-md text-xs-center>
            <v-img
                    src="../assets/hero.png"
                    height="200"
                    contain
            >
            </v-img>
            <h1 class="text-center">SigSep</h1>
            <p class="text-center">
                Open Resources for Music Source Separation
            </p>
        </header>
        <div >

        </div>
        <v-container bg grid-list-md text-xs-center>
            <v-layout row wrap align-center>
                <v-flex >
                      <v-btn color="secondary" v-on:click="reset" v-if="!isDisabled&&shouldRenderDropzone">Reset</v-btn>
                      <label for="clicable_file">
                      <div @drop.prevent="addFilesDrop" @dragover.prevent v-if="shouldRenderDropzone" id="dropzone">
                      <h2>Drag files or click in this area to upload</h2>
                        <ul>
                          <li v-for="file in files"  v-bind:key="file.name">
                            {{ file.name }} ({{ file.size / 1024}} kb)
                          </li>
                        </ul>
                      </div>
                      </label>
                      <input type="file"
                              style="visibility:hidden"
                              id="clicable_file"
                              v-if="shouldRenderDropzone"
                              @change="addFilesInputTag"
                      />

                    <div v-if=" shouldRenderSong">
                        <audio ref="ogAudio" controls>
                            <p>Your browser does not have the <code>audio</code> tag</p>
                        </audio>


                        <v-btn
                                color="secondary"
                                v-on:click="processSong"
                                :disabled="isDisabled"
                                :loading="isLoading"
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
                </v-flex>
            </v-layout>
        </v-container>
    </v-app>
</template>
<script>
import vueDropzone from "vue2-dropzone";
import vueHeadful from "vue-headful";
import Player from './../components/Player.vue'
import axios from 'axios'
import {readFile} from './../lib/umx.js'
import {modelProcess, loadModel} from 'open-unmix-js'


export default {
  name: 'Home',
  components: { Player, vueDropzone, vueHeadful},
  data () {
    return {
      decodedFiles: [],
      files:[],
      shouldRenderPlayer: false,
      shouldRenderSong: true,
      shouldRenderDropzone:true,
      disableInputTag: false,
      dark: true,
      player: null,
      combKey: 42,
      showPlayer: false,
      playerconf: {
        title: "",
        zoom: 1024,
        dark: true,
        streams: []
      },
      trackstoload: [],
      tracklist: [],
      fileName:"",
      isLoading: false,
      isDisabled: true,
      uploadProgress: false,
      progress: false,
      myProgress: 0,
        model: null,
    }
  },
  mounted: function () {

  },
  created: function () {

  },
  methods: {

    async addFile(files) {
      let blob = window.URL || window.webkitURL;
      ([...files]).forEach(file => {
            this.$refs.ogAudio.src =  blob.createObjectURL(file)
            this.playerconf.title = file.name;
            this.files.push(file)
            readFile(file, this.decodedFiles)
            this.isDisabled = false
            this.disableInputTag = true
      });
    },

    addFilesDrop(e) {
      let droppedFiles = e.dataTransfer.files;
      if(!droppedFiles) return;
      this.addFile(droppedFiles)
    },

    addFilesInputTag(e){
      let chosenFiles = e.target.files;
      if(!chosenFiles) return;
      this.addFile(chosenFiles)
    },

    reset(file){
      this.isDisabled = true
      this.files = []
    },

    async processSong(){
      this.isLoading = true
        //this.decodedFiles.src[0] -> channel 0
        //this.decodedFiles.src[1] -> channel 1
      // loadModel('http://storage.googleapis.com/open-unmix-models/umxhq-tfjs/model.json').then((response) => {
      //     console.log(response)
      // })



        loadModel("http://storage.googleapis.com/open-unmix-models/umxhq-tfjs/model.json", this.decodedFiles[0], this.decodedFiles[1]).then((result) =>
        {
          this.shouldRenderSong = false
          this.shouldRenderDropzone = false
          this.shouldRenderPlayer = true
          this.combKey = Math.ceil(Math.random() * 10000)
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
    },
  },
  computed: {

  }

}
</script>

<style lang="stylus">
#app {
   height: 100vh;
}


 #dropzone {
    height: 200px;
    padding: 40px;
    color: white;
    text-align: center;
    background: #303030;
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

<template>
  <v-app id="app" :dark="dark">
    <vue-headful
      title="SigSep"
      description="Open Resources for Music Source Separation"
    />
    <v-container bg grid-list-md text-xs-center>
      <v-layout row wrap align-center>
        <v-flex>
          <label for="clickable_file">
            <div
              @drop.prevent="addFilesDrop"
              @dragover.prevent
              v-if="shouldRenderDropzone"
              id="dropzone"
            >
              <h2>Drag an audio file or click in this area</h2>
              <ul>
                <li v-for="file in files" v-bind:key="file.name">
                  {{ file.name }} ({{ file.size / 1024 }} kb)
                </li>
              </ul>
            </div>
          </label>
          <input
            type="file"
            style="visibility:hidden"
            id="clickable_file"
            v-if="shouldRenderDropzone"
            @change="addFilesInputTag"
          />
          <vue-dropdown
            :config="config"
            @setSelectedOption="modelSelector($event)"
          ></vue-dropdown>
          <br />
          <div v-if="shouldRenderSong" id="outterAudio">
            <vuetify-audio flat :file="ogAudio" color="success"></vuetify-audio>
          </div>
          <div class="text-center">
            <v-btn
              color="secondary"
              class="ma-2"
              v-on:click="processSong"
              :disabled="isDisabled"
              :loading="isLoading"
            >
              Process Track
            </v-btn>
            <v-btn color="info" :disabled="isDisabled" v-on:click="reset"
              >Reset Track</v-btn
            >
          </div>
          <div v-if="shouldRenderPlayer">
            <v-card max-width="900" class="mx-auto" color="dark-grey" dark>
              <Player
                :key="combKey"
                ref="player"
                :urls="tracklist"
                :conf="playerconf"
              ></Player>
            </v-card>
            <div id="center">
              <div id="left">
                <v-btn color="primary" v-on:click="download(target)">
                  Download {{ target }}
                </v-btn>
              </div>
              <div id="right">
                <v-btn color="primary" v-on:click="download('back')">
                  Download background
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
import vueHeadful from "vue-headful";
import Player from "./../components/Player.vue";
import VueDropdown from "vue-dynamic-dropdown";
import VuetifyAudio from "vuetify-audio";
import { readFile } from "./../lib/umx.js";
import { modelProcess, loadModel } from "open-unmix-js";
const config = require("../../config/config");

export default {
  name: "Home",
  components: { Player, vueHeadful, VueDropdown, VuetifyAudio },
  data() {
    return {
      decodedFiles: [],
      files: [],
      shouldRenderPlayer: false,
      shouldRenderSong: false,
      shouldRenderDropzone: true,
      disableInputTag: false,
      dark: false,
      player: null,
      combKey: 42,
      showPlayer: false,
      playerconf: {
        title: "",
        zoom: 368,
        dark: true,
        streams: [],
      },
      trackstoload: [],
      tracklist: [],
      fileName: "",
      isLoading: false,
      isDisabled: true,
      uploadProgress: false,
      progress: false,
      myProgress: 0,
      model: null,
      openUnmix: null,
      ogAudio: "",
      modelUrl: "",
      target: "",
      config: {
        options: [
          {
            value: "Open-Unmix Vocals",
            target: "vocals",
            url: config.model.vocals,
          },
          {
            value: "Open-Unmix Drums",
            target: "drums",
            url: config.model.drums,
          },
          {
            value: "Open-Unmix Bass",
            target: "bass",
            url: config.model.bass,
          },
          {
            value: "Open-Unmix Other/Instrumentals",
            target: "other",
            url: config.model.other,
          },
        ],
        placeholder: "Select model",
        width: "100%",
      },
    };
  },
  mounted: function() {},
  created: function() {},
  methods: {
    async addFile(files) {
      console.log("booooooooom");
      let blob = window.URL || window.webkitURL;
      [...files].forEach((file) => {
        console.log(file);
        this.ogAudio = blob.createObjectURL(file);
        this.playerconf.title = file.name;
        this.files.push(file);
        readFile(file, this.decodedFiles); // Put decoded files into this.decodedFiles
        this.isDisabled = false;
        this.shouldRenderSong = true;
        this.shouldRenderDropzone = false;
      });
    },
    addFilesDrop(e) {
      let droppedFiles = e.dataTransfer.files;
      if (!droppedFiles) return;
      this.addFile(droppedFiles);
    },

    addFilesInputTag(e) {
      let chosenFiles = e.target.files;
      if (!chosenFiles) return;
      this.addFile(chosenFiles);
    },

    reset(file) {
      this.isDisabled = true;
      this.disableInputTag = false;
      this.shouldRenderDropzone = true;
      this.shouldRenderSong = false;
      this.shouldRenderPlayer = false;
      this.files = [];
    },

    modelSelector(selectedOption) {
      this.config.placeholder = selectedOption.value;
      this.modelUrl = selectedOption.url;
      this.target = selectedOption.target;
    },

    async processSong() {
      this.isLoading = true;
      if (this.modelUrl === "") {
        alert("Please select a model");
        this.isLoading = false;
        return 1;
      }

      await loadModel(this.modelUrl);
      modelProcess(
        this.decodedFiles[0],
        this.decodedFiles[1],
        this.target
      ).then((result) => {
        this.shouldRenderSong = false;
        this.shouldRenderPlayer = true;
        this.isLoading = false;
        this.combKey = Math.ceil(Math.random() * 10000);
        let trackstoload = [];
        for (let stem of result.stems) {
          trackstoload.push({
            name: stem.name,
            customClass: stem.name,
            solo: false,
            mute: false,
            src: stem.data,
          });
        }
        this.tracklist = trackstoload;
      });
    },

    download(track) {
      let t = 0;
      if (track == "back") t = 1;
      console.log(this.tracklist[0].src);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(this.tracklist[t].src);
      let basename = this.playerconf.title
        .split(".")
        .slice(0, -1)
        .join(".");
      link.download = basename + "_" + track + ".wav";
      link.click();
      URL.revokeObjectURL(link.href);
      link.remove();
    },
  },
  computed: {},
};
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

#audio {
    display: block;
    margin-left: auto;
    margin-right: auto;
    width: 100%;
}

#outterAudio {
    display: block;
    margin-left: auto;
    margin-right: auto;
    width: 100%;
}
</style>

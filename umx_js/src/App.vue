<template>
  <v-app id='app' :dark="dark">
  <v-container>
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
  </v-container>    
  </v-app>
</template>

<script>
import Player from './components/Player.vue'
import axios from 'axios'

export default {
  name: 'App',
  components: { Player },
  data () {
    return {
      dark: false,
      tracks: [],
      stems: [],
      selectedTrack: '',
      baseUrl: process.env.BASE_URL
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
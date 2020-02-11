<template>
  <div id='player'>
    
    <div>
      <h2>{{title}}</h2>
    <v-btn
      :dark="conf.dark"
      color="green accent-2"
      top
      right
      small
      v-on:click='playpause'
      :disabled='isLoading'
      :depressed='isPlaying'
    >
      <v-icon>mdi-play</v-icon>
    </v-btn>
    <v-btn
      :dark="conf.dark"
      color="red accent-2"
      top
      right
      small
      v-on:click='stop'
      :disabled='isLoading'
    >
      <v-icon>mdi-stop</v-icon>
    </v-btn>
    </div>
    
    <div ref="playlist"></div>
    <p></p>
    <v-progress-linear
      :dark="conf.dark"
      color="green accent-2"
      indeterminate
      rounded
      height="6"
      :active="isLoading"
    ></v-progress-linear>
    <div style="margin-top: -20px" v-if="NumberOfTracks > 0">
      <b>Keyboard Shortcuts</b>: 
        Play/Pause: <kbd>Space</kbd> – 
        Solo/Unsolo Sources: <kbd v-for="n in NumberOfTracks" :key="n">{{ n }}</kbd> – 
        Mute/Unmute Sources: <kbd>Ctrl</kbd> + <kbd v-for="n in NumberOfTracks" :key="n">{{ n }}</kbd> 
    </div>
  </div>
</template>

<script>
import Mousetrap from 'mousetrap'
import player from './player.js'
import styles from './dark.css';

export default {
  name: "player",
  components: {},
  props: {
    urls: Array,
    conf: Object,
  },
  data: function () {
    return {
      isPlaying: false,
      isLoading: false,
      player: Object,
      loaderColor: 'orange',
      loaderHeight: '26px',
      playbackPosition: 0,
      lastplaybackPosition: 0
    }
  },
  mounted: function () {
    Mousetrap.bind('space', this.playpause)
    this.initPlayer()
  },
  beforeDestroy: function () {
    Mousetrap.unbind('space');
    for (var i = 0; i < this.player.playlist.tracks.length; ++i) {
      (function (i) {
      Mousetrap.unbind(String(i + 1));
      })(i);
    }
    this.stop();
    delete this.player;
  },
  methods: {
    initPlayer: function () {
      this.player = new player(this.conf.dark, this.$refs.playlist, this.conf.zoom)
      this.player.playlist.getEventEmitter().on('audiosourcesloaded', this.audioLoaded)
      this.player.playlist.getEventEmitter().on('timeupdate', this.updateTime)
      if(this.isLoading != true) {
        this.saveState()
        this.stop()
        this.isLoading = true
        this.player.loadTargets(this.urls)
        for (var i = 0; i < this.urls.length; ++i) {
            (function (i, e) {
                Mousetrap.bind(String(i + 1), function () {
                  e.player.playlist.getEventEmitter().emit('solo', e.player.playlist.tracks[i])
                });
                Mousetrap.bind(['ctrl+' + String(i + 1), 'meta+' + String(i + 1)], function () {
                  e.player.playlist.getEventEmitter().emit('mute', e.player.playlist.tracks[i])
                });
            })(i, this)
          }
        }
    },
    saveState: function () {
      this.lastplaybackPosition = this.playbackPosition
    },
    playpause: function (event) {
      if (this.isPlaying) {
        this.player.playlist.getEventEmitter().emit('pause')
      }
      else {
        this.player.playlist.getEventEmitter().emit('play')
        this.player.playlist.getEventEmitter().on('finished', this.stop);
      }
      this.isPlaying = ! this.isPlaying
      event.stopPropagation();
      return false;
    },
    stop: function () {
      this.player.playlist.getEventEmitter().emit('stop')
      this.isPlaying = false
    },
    toggleMode: function () {
      this.$emit('toggleMode', "foo")
    },
    audioLoaded: function () {
      this.isLoading = false
    },
    updateTime: function (playbackPosition) {
      this.playbackPosition = playbackPosition
    },
  },
  computed: {
    title: function () {
      if (typeof this.conf === "undefined") {
        return "Empty Track"
      } else {
        return this.conf.title
      }
    },
    NumberOfTracks: function () {
      if (typeof this.player.playlist === "undefined") {
        return 0
      }
      else {
        return this.player.playlist.tracks.length
      }
    }
  },
  watch: {
    urls: {
      handler: 'initPlayer'
    },
  }
}
</script>

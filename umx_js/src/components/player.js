import * as WaveformPlaylist from 'waveform-playlist'

var Player = function (dark, ref, zoom=1280) {
    if (dark) {
        var wcolor = "black"
    } else {
        var wcolor = "white"
    }
    this.playlist = WaveformPlaylist.init({
        samplesPerPixel: zoom,
        waveHeight: 60,
        container: ref,
        timescale: true,
        mono: true,
        exclSolo: false,
        isAutomaticScroll: true,
        state: 'cursor',
        colors: {
            waveOutlineColor: wcolor
        },
        controls: {
            show: true, //whether or not to include the track controls
            width: 100 //width of controls in pixels
        },
        zoomLevels: [zoom]
    });
}

Player.prototype.loadTargets = function (trackurls) {
    this.playlist.getEventEmitter().emit('stop')
    this.playlist.clear();
    this.playlist.tracks = []
    var tracksToLoad = []
    for (let track of trackurls) {
        tracksToLoad.push(
            {
                "src": track.src,
                "name": track.name,
                "muted": track.mute,
                "customClass": track.customClass,
                "soloed": track.solo,
            }
        );
    }
    this.playlist.load(tracksToLoad);
}

export default Player

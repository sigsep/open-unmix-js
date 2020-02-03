<template>
  <v-container>
    <input type="file" ref="file" @change="test" style="display: none">
    <button @click="$refs.file.click()">open file dialog</button> <!-- Allows us to customize input selector -->
  </v-container>
</template>

<script>
/* eslint-disable */
//var lib = require('../../../src/index')
export default {
  name: 'Loader',
  methods: {
    test: function() {
      const file = event.target.files[0]
      //lib.decodeFile(file.webkitRElativePath)
      console.log(file)
    }
  }
}

</script>

<template>
  <div class="home">
    <img alt="Vue logo" src="../assets/logo.png">
    <Loader/>
  </div>
</template>

<script>
// @ is an alias to /src
import Loader from '@/components/Loader.vue'

export default {
  name: 'home',
  components: {
    Loader
  }
}
</script>

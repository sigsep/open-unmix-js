import Vue from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import vuetify from './plugins/vuetify';
import VuePromiseBtn from 'vue-promise-btn'

// not required. Styles for built-in spinner
import 'vue-promise-btn/dist/vue-promise-btn.css'

Vue.use(VuePromiseBtn)
Vue.config.productionTip = false

new Vue({
  router,
  store,
  vuetify,
  render: h => h(App)
}).$mount('#app')

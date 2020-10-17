module.exports = {
  "transpileDependencies": [
    "vuetify"
  ],

  configureWebpack: {
    devServer: {
      headers: { 'Access-Control-Allow-Origin': '*' }
    }
  },

  publicPath: process.env.NODE_ENV === 'production'
    ? '/open-unmix-js/'
    : '/'
}

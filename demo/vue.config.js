module.exports = {
  "transpileDependencies": [
    "vuetify"
  ],

  configureWebpack: {
    devServer: {
      headers: { 'Access-Control-Allow-Origin': '*' }
    },
  },

  publicPath: process.env.NODE_ENV === 'production'
    ? '/open-unmix-js/'
    : '/'
}

module.exports = {
  configureWebpack: (config) => {
    config.module.rules = [
      {
        test: /\.worker\.js$/i,
        use: [
          {
            loader: 'comlink-loader',
            options: {
              singleton: true
            }
          }
        ]
      },
      ...config.module.rules
    ]
  }
}

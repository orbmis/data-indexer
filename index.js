const DataFetcher = require('./datafetcher')

const dataFetcher = new DataFetcher()

dataFetcher.getData()
  .then(dataFetcher.formatData)
  .then(dataFetcher.getGiniCoefficients)
  .then(console.log)

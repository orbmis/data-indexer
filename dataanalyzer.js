const fs = require('fs')

class DataAnalyzer {

  loadData() {
    const testFolder = './data/'

    const calculateIndices = this.calculateIndices

    fs.readdirSync(testFolder).forEach(file => {
      const date = file.replace('data_', '').replace('.json', '')

      const data = require(testFolder.concat(file))

      const formattedData = this.formatData(data)

      const indices = calculateIndices(formattedData)

      const keys = Object.keys(Object.entries(indices)[0][1])

      const transposedData = keys.reduce((acc, k) => ({
        ...acc,
        [k]: {
          giniCoefficients: indices.giniCoefficients[k],
          herfindahlHirschmanIndices: indices.herfindahlHirschmanIndices[k],
          atkinsonIndex: indices.atkinsonIndex[k],
          shannonEntropy: indices.shannonEntropy[k],
        }
      }), {})

      console.log(`\n${date}:`)
      console.table(transposedData)
    })
  }

  formatData(data) {
    const amountStakedByPool = data.amountStakedByPool.map(record => ({
      key: record.entity,
      value: record.amount_staked,
    }))

    const blocksByRelays = data.blocksByRelays.map(record => ({
      key: record.name,
      value: record.value,
    }))

    const blocksByBuilder = data.blocksByBuilder.map(record => ({
      key: record.name,
      value: record.count,
    }))

    const nativeAssetsByAddress = Object.entries(data.nativeAssetsByAddress).map(record => ({
      key: Number(record[0].replace('above_', '').replace('_', '.')),
      value: record[1],
    }))

    const exchangeBySupply = Object.entries(data.exchangeBySupply).map(record => ({
      key: record[0],
      value: record[1],
    }))
    .filter(i => i.value !== null)

    const activityByBundler = data.activityByBundler.map(record => ({
      key: record.bundler,
      value: record.numberTransactions,
    }))

    const stablecoinsByTvl = data.stablecoinsByTvl.map(record => ({
      key: record.symbol,
      value: record.TVL,
    }))

    const rollupsByTvl = data.rollupsByTvl.map(record => ({
      key: record.name,
      value: record.tvl,
    }))

    const payload = {
      executionNodesByCountry: data.executionNodesByCountry,
      executionNodesByClientBase: data.executionNodesByClientBase,
      consensusNodesByCountry: data.consensusNodesByCountry,
      consensusNodesByClient: data.consensusNodesByClient,
      amountStakedByPool,
      blocksByRelays,
      blocksByBuilder,
      nativeAssetsByAddress,
      exchangeBySupply,
      activityByBundler,
      stablecoinsByTvl,
      rollupsByTvl,
    }

    return payload
  }

  calculateIndices(data) {
    const keys = Object.keys(data)

    data.nativeAssetsByAddress = DataAnalyzer.normalizeNativeAssetDistribution(data.nativeAssetsByAddress)

    const giniCoefficients = Object.entries(data).reduce((acc, cur) => ({
      ...acc, [cur[0]]: DataAnalyzer.calculateGiniCoefficient(cur[1].map(i => i.value))
    }), {})

    const herfindahlHirschmanIndices = Object.entries(data).reduce((acc, cur) => ({
      ...acc, [cur[0]]: DataAnalyzer.calculateHerfindahlHirschmanIndex(cur[1].map(i => i.value))
    }), {})

    const atkinsonIndex = Object.entries(data).reduce((acc, cur) => ({
      ...acc, [cur[0]]: DataAnalyzer.calculateAtkinsonIndex(cur[1].map(i => i.value), 0.5)
    }), {})

    const shannonEntropy = Object.entries(data).reduce((acc, cur) => ({
      ...acc, [cur[0]]: DataAnalyzer.calculateEntropy(cur[1].map(i => i.value))
    }), {})

    // console.log('\nHerfindahl-Hirschman Indices:\n', herfindahlHirschmanIndices)

    // console.log('\nGini Coefficients:\n')

    return { giniCoefficients, herfindahlHirschmanIndices, atkinsonIndex, shannonEntropy }
  }

  static normalizeNativeAssetDistribution(data) {
    let n = 0
    let i = data.length

    while (i > 0) {
      const k = n + data[i - 1].value
      data[i - 1].value -= n
      n = k
      i--
    }

    return data
  }

  // https://www.wallstreetmojo.com/lorenz-curve/
  // https://www.wallstreetmojo.com/gini-coefficient/
  // https://economics.stackexchange.com/questions/16444/calculating-gini-coeffecient
  // https://shsr2001.github.io/beacondigest/notebooks/2021/07/19/measuring_decentralization.html
  // https://docs.glassnode.com/basic-api/endpoints/addresses#addresses-with-balance-1k
  static calculateGiniCoefficient(data) {
    // the following row is test data
    // data = [10, 10, 10, 10, 10, 10, 20, 20, 20, 80]

    // Sort the data by value in increasing order
    let sorted = data.sort((a, b) => (a - b))

    // normalize arrays that have negative values
    sorted = sorted[0] < 0 ? sorted.map(n => n + (sorted[0] * -1) + 1) : sorted

    const sumOfAllValues = data.reduce((b, c) => b += c, 0)

    const n = data.length

    const rows = sorted.reduce((acc, cur, index) => {
      // don't count values that have already been counted
      if (acc.length > 0 && acc[acc.length - 1].value === cur) {
        return acc
      }

      const frequency = sorted.reduce((sum, value) => {
        sum += value === cur ? 1 : 0

        return sum
      }, 0)

      const fractionOfDistribution = (frequency * cur) / sumOfAllValues
      const fractionOfPopulation = frequency / n

      const numberOfPopulationWithMore = sorted.reduce((a,c) => {
        a += c > cur ? 1 : 0

        return a
      }, 0)

      const fractionOfPopulationWithMore = numberOfPopulationWithMore / n

      const score = fractionOfDistribution * (fractionOfPopulation + (2 * fractionOfPopulationWithMore))

      acc.push({
        value: cur,
        frequency,
        fractionOfDistribution,
        fractionOfPopulation,
        fractionOfPopulationWithMore,
        score,
      })

      return acc
    }, [])

    const sumOfRows = rows.reduce((acc, cur) => acc += cur.score, 0)

    const giniCoefficient = 1 - sumOfRows

    return Number(giniCoefficient.toFixed(2))
  }

  // calculates the Herfindahl-Hirschman Index for a set of data
  static calculateHerfindahlHirschmanIndex(data) {
    const totalAmount = data.reduce((acc, cur) => acc + cur, 0)

    // convert each value to shares
    const shares = data.map(value => value / totalAmount)

    // Square each market share
    const squaredShares = shares.map((share) => share ** 2)

    // Sum the squared market shares
    const herfindahlHirschmanIndex = squaredShares.reduce((acc, cur) => acc + cur, 0)

    return Number(herfindahlHirschmanIndex.toFixed(2))
  }

  static calculateAtkinsonIndex(data, epsilon) {
    const n = data.length
    const mean = data.reduce((sum, value) => sum + value, 0) / n

    const numerator = data.reduce((sum, value) => sum + (value ** (1 - epsilon)), 0)
    const denominator = n * (mean ** (1 - epsilon))

    const atkinsonIndex = 1 - (numerator / denominator) ** (1 / (1 - epsilon))

    return Number(atkinsonIndex.toFixed(2))
  }

  // https://gist.github.com/jabney/5018b4adc9b2bf488696
  static calculateShannonEntropy(data) {
    var textLength = text.length

    // find symbolCount of all symbols
    var symbolCount = {}

    for (var i = 0; i < textLength; i++) {
        var symbol = text[i]

        if (symbolCount[symbol] === undefined) {
            symbolCount[symbol] = 1
        } else {
            symbolCount[symbol]++
        }
    }

    var complexity = 0
    var allCounts = Object.values(symbolCount)
    var allCountsLength = allCounts.length

    for (var i = 0; i < allCountsLength; i++) {
        complexity = complexity - allCounts[i]/textLength * Math.log2(allCounts[i]/textLength)
    }

    return complexity
  }

  // ChatGPT
  static calculateEntropy(data) {
    let total = 0

    for (let exchange in data) {
      total += data[exchange]
    }
    
    let probabilities = []

    for (let exchange in data) {
      probabilities.push(data[exchange] / total)
    }
    
    let informationContent = []

    for (let i = 0; i < probabilities.length; i++) {
      informationContent.push(-Math.log2(probabilities[i]))
    }
    
    let entropy = 0

    for (let i = 0; i < probabilities.length; i++) {
      entropy -= probabilities[i] * informationContent[i]
    }
    
    return Number(entropy.toFixed(2))
  }
}

module.exports = DataAnalyzer

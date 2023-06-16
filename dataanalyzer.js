const fs = require('fs')

class DataAnalyzer {

  loadData() {
    const testFolder = './data/'

    const calculateIndices = this.calculateIndices

    const capitalize = k => k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())

    fs.readdirSync(testFolder).forEach(file => {
      const date = file.replace('data_', '').replace('.json', '')

      const data = require(testFolder.concat(file))

      const formattedData = this.formatData(data)

      const indices = calculateIndices(formattedData)

      const keys = Object.keys(Object.entries(indices)[0][1])

      const transposedData = keys.reduce((acc, k) => ({
        ...acc,
        [capitalize(k)]: {
          Gini: indices.giniCoefficients[k],
          HHI: indices.herfindahlHirschmanIndices[k],
          Atkinson: indices.atkinsonIndex[k],
          Shannon: indices.shannonEntropy[k],
        }
      }), {})

      console.log(`\n${date}:`)
      console.table(transposedData)

      const csv = this.createCsv(transposedData)
    })
  }

  createCsv(data) {
    return data
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
      ...acc, [cur[0]]: DataAnalyzer.calculateShannonEntropy(cur[1].map(i => i.value))
    }), {})

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

  // based on relative mean absolute difference
  // this directly implements the formula on the paper
  static calculateGiniCoefficient(array) {
    let sum = 0
    let n = array.length
    let arraySum = array.reduce((a, b) => a + b, 0)
    let μ = arraySum / n

    for(let i = 0; i < n; i++) {
        for(let j = 0; j < n; j++) {
            sum += Math.abs(array[i] - array[j])
        }
    }

    const giniCoefficient = sum / (2 * n * n * μ)

    return Number(giniCoefficient.toFixed(2))
  }

  // calculates the Herfindahl-Hirschman Index for a set of data
  static calculateHerfindahlHirschmanIndex(data) {
    const totalAmount = data.reduce((acc, cur) => acc + cur, 0)

    // convert each value to shares
    const shares = data.map(value => value / totalAmount)

    // Square each market share
    const squaredShares = shares.map((share) => (share * 100) ** 2)

    // Sum the squared market shares
    const herfindahlHirschmanIndex = squaredShares.reduce((acc, cur) => acc + cur, 0)

    const normalized = herfindahlHirschmanIndex / (10 ** 4)

    return Number(normalized.toFixed(2))
  }

  // https://www.omnicalculator.com/ecology/shannon-index
  static calculateShannonEntropy(data) {
    const totalCount = data.length
    const counts = {}

    // Count the frequency of each unique value/category in the data
    for (let i = 0; i < totalCount; i++) {
      const value = data[i]

      counts[value] = counts[value] ? counts[value] + 1 : 1
    }

    const numberDistinctValues = Object.keys(counts).length

    let entropy = 0

    // Calculate the entropy using the formula
    for (const value in counts) {
      const probability = counts[value] / totalCount

      entropy -= probability * Math.log2(probability)
    }

    return Number((entropy / 10).toFixed(2))
  }
  

  static calculateAtkinsonIndex(incomes, epsilon) {
    let N = incomes.length

    // Calculate mean income
    let mu = incomes.reduce((a, b) => a + b, 0) / N

    let atkinsonIndex

    if (epsilon === 1) {
      // Use the geometric mean when epsilon = 1
      const product = incomes.reduce((a, b) => a * Math.pow(b, 1/N), 1)

      atkinsonIndex = 1 - product / mu
    } else {
      // Use the general formula when epsilon != 1
      const sum = incomes.reduce((a, b) => a + Math.pow(b / mu, 1 - epsilon), 0)

      atkinsonIndex = 1 - Math.pow(sum / N, 1 / (1 - epsilon))
    }

    return Number(atkinsonIndex.toFixed(2))
  }
}

module.exports = DataAnalyzer

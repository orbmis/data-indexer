const fs = require('fs')

class DataAnalyzer {

  constructor() {
    this.dataCache = null
  }

  loadData() {
    const testFolder = './data/'

    const calculateIndices = this.calculateIndices

    const capitalize = k => k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())

    const cacheData = this.cacheData.bind(this)

    const weightings = {
      executionNodesByCountry: 1,
      executionNodesByClientBase: 1,
      consensusNodesByCountry: 1,
      consensusNodesByClient: 1,
      amountStakedByPool: 1,
      blocksByRelays: 0.7,
      blocksByBuilder: 0.7,
      nativeAssetsByAddress: 1,
      exchangeBySupply: 0.7,
      activityByBundler: 0.2,
      stablecoinsByTvl: 0.3,
      rollupsByTvl: 0.5,
    }

    fs.readdirSync(testFolder).forEach(file => {
      const date = file.replace('data_', '').replace('.json', '')

      const data = require(testFolder.concat(file))

      const formattedData = this.formatData(data)

      const previousRoundsData = this.dataCache ? this.formatData(this.dataCache) : null

      const indices = calculateIndices(formattedData, previousRoundsData)

      let pandq

      if (this.dataCache) {
        pandq = this.getComparisonData(data, this.dataCache)
      }

      // TODO: calculate JSD for 30 day intervals

      cacheData(data)

      const keys = Object.keys(Object.entries(indices)[0][1])

      const masterIndices = Object.entries(indices).reduce((acc, index) => {
        return { ...acc, [index[0]]: this.calculateMasterIndex(index[1], weightings) }
      }, {})

      const transposedData = keys.reduce((acc, k) => ({
        ...acc,
        [capitalize(k)]: {
          Gini: indices.giniCoefficients[k],
          HHI: indices.herfindahlHirschmanIndices[k],
          Atkinson: indices.atkinsonIndex[k],
          Shannon: indices.shannonEntropy[k],
          euclideanDistance: indices.euclideanDistance[k],
          js_divergence: pandq ? DataAnalyzer.js_divergence(pandq[k][0], pandq[k][1]) : null,
        }
      }), {})

      transposedData.masterIndex = {
        Gini: masterIndices.giniCoefficients,
        HHI: masterIndices.herfindahlHirschmanIndices,
        Atkinson: masterIndices.atkinsonIndex,
        Shannon: masterIndices.shannonEntropy,
        euclideanDistance: masterIndices.euclideanDistance,
      }

      console.log(`\n${date}:`)
      console.table(transposedData)

      const csv = this.createCsv(transposedData)
    })
  }

  cacheData(data) {
    this.dataCache = data
  }

  createCsv(data) {
    return data
  }

  transpose(data) {
    const p = data.map(i => i.p)
    const q = data.map(i => i.q)

    return [ p, q ]
  }

  getComparisonData(data, datacache) {
    const findByKey = (dataset, match, key, value) => {
      let datum = dataset.find(i => i[key] === match)

      datum = datum ? datum[value] : null

      return datum || 0
    }

    // TODO:  we need to decide which dataset is larger, and iterate through that one, and pad the other

    const amountStakedByPool = this.transpose(data.amountStakedByPool.map(record => ({
      p: record.amount_staked,
      q: findByKey(datacache.amountStakedByPool, record.entity, 'entity', 'amount_staked'),
    })))

    const executionNodesByCountry = this.transpose(data.executionNodesByCountry.map(record => ({
      p: record.value,
      q: findByKey(datacache.executionNodesByCountry, record.key, 'key', 'value'),
    })))

    const executionNodesByClientBase = this.transpose(data.executionNodesByClientBase.map(record => ({
      p: record.value,
      q: findByKey(datacache.executionNodesByClientBase, record.key, 'key', 'value'),
    })))

    const consensusNodesByCountry = this.transpose(data.consensusNodesByCountry.map(record => ({
      p: record.value,
      q: findByKey(datacache.consensusNodesByCountry, record.key, 'key', 'value'),
    })))

    const consensusNodesByClient = this.transpose(data.consensusNodesByClient.map(record => ({
      p: record.value,
      q: findByKey(datacache.consensusNodesByClient, record.key, 'key', 'value'),
    })))

    const blocksByRelays = this.transpose(data.blocksByRelays.map(record => ({
      p: record.value,
      q: findByKey(datacache.blocksByRelays, record.name, 'name', 'value'),
    })))

    const blocksByBuilder = this.transpose(data.blocksByBuilder.map(record => ({
      p: record.count,
      q: findByKey(datacache.blocksByBuilder, record.name, 'name', 'count'),
    })))

    const nativeAssetsByAddress = this.transpose(Object.entries(data.nativeAssetsByAddress).map(record => ({
      p: record[1],
      q: findByKey(Object.entries(data.nativeAssetsByAddress), record[0], 0, 1),
    })))

    const exchangeBySupply = this.transpose(Object.entries(data.exchangeBySupply).map(record => ({
      p: record[1] || 0,
      q: findByKey(Object.entries(data.exchangeBySupply), record[0], 0, 1),
    })))

    const activityByBundler = this.transpose(data.activityByBundler.map(record => ({
      p: record.numberTransactions,
      q: findByKey(datacache.activityByBundler, record.bundler, 'bundler', 'numberTransactions'),
    })))

    const stablecoinsByTvl = this.transpose(data.stablecoinsByTvl.map(record => ({
      p: record.TVL,
      q: findByKey(datacache.stablecoinsByTvl, record.symbol, 'symbol', 'TVL'),
    })))

    const rollupsByTvl = this.transpose(data.rollupsByTvl.map(record => ({
      p: record.tvl,
      q: findByKey(datacache.rollupsByTvl, record.name, 'name', 'tvl'),
    })))

    const payload = {
      executionNodesByCountry,
      executionNodesByClientBase,
      consensusNodesByCountry,
      consensusNodesByClient,
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

  calculateIndices(data, previousRoundsData) {
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

    const euclideanDistance = Object.entries(data).reduce((acc, cur) => {
      const previousData = previousRoundsData ? previousRoundsData[cur[0]].map(i => i.value) : []

      return { ...acc, [cur[0]]: DataAnalyzer.calculateEuclideanDistance(cur[1].map(i => i.value), previousData) }
    }, {})

    return { giniCoefficients, herfindahlHirschmanIndices, atkinsonIndex, shannonEntropy, euclideanDistance }
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

  static calculateEuclideanDistance(data, previousData) {
    // console.log('DATA:', data)
    // console.log('PREVIOUS DATA:', previousData)

    const n = data.length

    let distance = 0

    for (let i = 0; i < n; i++) {
      const ED = Math.pow(data[i] - previousData[i], 2)
      distance += ED
    }

    const euclideanDistance = Math.sqrt(distance)

    return Number(euclideanDistance.toFixed(2))
  }

  calculateMasterIndex(metrics, weightings) {
    const beta = Object.entries(metrics).map(metric => metric.pop())
    const omega = Object.entries(weightings).map(metric => metric.pop())
    const n = beta.length

    // Check if arrays have the same length
    if (n !== omega.length) {
      throw new Error("Arrays beta and omega must have the same length.")
    }

    // Calculate product of all (beta[i] * omega[i]) values
    const product = beta.reduce((acc, betaValue, i) => acc * (betaValue * omega[i]), 1)

    // Calculate gamma
    const gamma = (Math.pow(product, 1 / n) - Math.min(...beta)) / (Math.max(...beta) - Math.min(...beta))

    return Number(gamma.toFixed(2))
  }

  static padArray(array, size, defaultValue) {
    while(array.length < size) {
      array.push(defaultValue)
    }
  }

  static kl_divergence(p, q) {
    let sum = 0

    for(let i = 0; i < p.length; i++) {
      if(p[i] != 0) {
        sum += p[i] * Math.log(p[i] / q[i])
      }
    }

    return sum
  }

  static js_divergence(p, q) {
    const sump = p.reduce((acc, cur) => acc + cur, 0)
    const sumq = p.reduce((acc, cur) => acc + cur, 0)

    p = p.map(i => i / sump)
    q = q.map(i => i / sumq)

    DataAnalyzer.padArray(p, q.length, 0)
    DataAnalyzer.padArray(q, p.length, 0)

    let m = []

    for(let i = 0; i < p.length; i++) {
      m[i] = 0.5 * (p[i] + q[i])
    }

    const JSD = (0.5 * DataAnalyzer.kl_divergence(p, m) + 0.5 * DataAnalyzer.kl_divergence(q, m)) / Math.log(2)

    return Number(JSD.toFixed(7))
  }
  
}

module.exports = DataAnalyzer

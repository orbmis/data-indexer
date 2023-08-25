const fs = require('fs')
const util = require('util')

class DataAnalyzer {

  constructor() {
    this.dataCache = null
  }

  loadData() {
    const datafolder = './data/'

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

    let GCSV, HHICSV, SCSV, masterIndex

    let headerRowAdded = false
    
    // keys in format: 2023-05-19
    const relayData = require('./relays.json')
    const blockBuilderData = require('./block_builders.json')

    let summation = {}

    let numberOfDaysInDataSet = 0

    let lastRecordedTransposedData = {}
    let lastRecordedIndices = {}

    let firstRecordedTransposedData = null
    let firstRecordedIndices = null
    let lastRecordedDate = null

    fs.readdirSync(datafolder).forEach(file => {
      if (file.slice(-4) !== 'json') {
        return
      }

      const date = file.replace('data_', '').replace('.json', '')

      // console.log('DATE:', date)

      const data = require(datafolder.concat(file))
      const formattedData = this.formatData(data)
      
      formattedData.blocksByBuilder = blockBuilderData[date].map(i => ({ key: i.builder, value: i.count }))
      formattedData.blocksByRelays = relayData[date].map(i => ({ key: i.relay, value: i.count }))

      const previousRoundsData = this.dataCache ? this.dataCache : null

      const indices = calculateIndices(formattedData, previousRoundsData)

      let pandq

      if (this.dataCache) {
        pandq = this.getComparisonData(formattedData, this.dataCache)
      }

      if (!this.firstDataCache) {
        this.firstDataCache = formattedData
      }

      cacheData(formattedData)

      const keys = Object.keys(Object.entries(indices)[0][1])

      const masterIndices = Object.entries(indices).reduce((acc, index) => {
        return { ...acc, [index[0]]: this.calculateMasterIndex(index[1], weightings) }
      }, {})

      numberOfDaysInDataSet++

      const transposedData = keys.reduce((acc, k) => {
        if (summation[capitalize(k)] === undefined) {
          summation[capitalize(k)] = {
            Gini: 0,
            HHI: 0,
            Atkinson: 0,
            Shannon: 0,
            JSD: 0,
            'P90:P10': 0,
          }
        }

        summation[capitalize(k)].Gini += indices.giniCoefficients[k]
        summation[capitalize(k)].HHI += indices.herfindahlHirschmanIndices[k]
        summation[capitalize(k)].Atkinson += indices.atkinsonIndex[k]
        summation[capitalize(k)].Shannon += indices.shannonEntropy[k]
        summation[capitalize(k)].JSD += pandq ? DataAnalyzer.js_divergence(pandq[k][0], pandq[k][1]) : null
        summation[capitalize(k)]['P90:P10'] += indices.P90P10[k]

        return {
          ...acc,
          [capitalize(k)]: {
            Gini: indices.giniCoefficients[k],
            HHI: indices.herfindahlHirschmanIndices[k],
            Atkinson: indices.atkinsonIndex[k],
            Shannon: indices.shannonEntropy[k],
            JSD: pandq ? DataAnalyzer.js_divergence(pandq[k][0], pandq[k][1]) : 0,
            'P90:P10': indices.P90P10[k],
          }
        }
      }, {})

      transposedData.masterIndex = {
        Gini: masterIndices.giniCoefficients,
        HHI: masterIndices.herfindahlHirschmanIndices,
        Atkinson: masterIndices.atkinsonIndex,
        Shannon: masterIndices.shannonEntropy,
      }

      if (!headerRowAdded) {
        GCSV = 'Date,' + Object.keys(transposedData).join(',').concat('\n')
        HHICSV = 'Date,' + Object.keys(transposedData).join(',').concat('\n')
        SCSV = 'Date,' + Object.keys(transposedData).join(',').concat('\n')
        masterIndex = 'Date,' + 'Gini,HHI,Atkinson,Shannon\n'
      }

      headerRowAdded = true

      // console.log(`\n${date}:`)
      // console.table(transposedData)

      lastRecordedTransposedData = transposedData
      lastRecordedIndices = indices
      lastRecordedDate = date

      if (!firstRecordedTransposedData) {
        console.log(`\n${date}:`)
        console.table(transposedData)

        firstRecordedTransposedData = transposedData
        firstRecordedIndices = indices
      }

      GCSV += this.createCsv(date, transposedData, 'Gini')
      HHICSV += this.createCsv(date, transposedData, 'HHI')
      SCSV += this.createCsv(date, transposedData, 'Shannon')

      masterIndex += date + ',' + Object.values(transposedData.masterIndex).join(',').concat('\n')
    })

    console.log(`\n${lastRecordedDate}:`)
    console.table(lastRecordedTransposedData)

    const pq = this.getComparisonData(this.firstDataCache, this.dataCache)
    const JSDs = Object.entries(pq).reduce((acc, cur) => {
      return {
        ...acc,
        [cur[0]]: DataAnalyzer.js_divergence(cur[1][0], cur[1][1])
      }
    }, {})

    const averages = Object.entries(summation).reduce((acc, cur) => {
      return {
        ...acc,
        [cur[0]]: Object.entries(cur[1]).reduce((a, c) => {
          return {
            ...a, [c[0]]: Number((c[1] / numberOfDaysInDataSet).toFixed(2)),
          }
        }, {}),
      }
    }, {})

    console.log('\n30 Day Averages:')
    console.table(averages)

    console.log('\n Jensen-Shannon Diverage across 30 days:')
    console.table(JSDs)

    fs.writeFileSync('./reports/gini.csv', GCSV);
    fs.writeFileSync('./reports/HHI.csv', HHICSV);
    fs.writeFileSync('./reports/shannon.csv', SCSV);
    fs.writeFileSync('./reports/master.csv', masterIndex);
  }

  cacheData(data) {
    this.dataCache = data
  }

  createCsv(date, data, index) {
    const csvrow = Object.entries(data).map(i => i[1][index]).join(',').concat('\n')

    return date.concat(',', csvrow)
  }

  transpose(data) {
    const p = data.map(i => i.p)
    const q = data.map(i => i.q)

    return [ p, q ]
  }

  findByKey(dataset, match, key, value) {
    let datum = dataset.find(i => i[key] === match)

    datum = datum ? datum[value] : null

    return datum || 0
  }

  createComparisonArrays(data, datacache, k, key, value) {
    data[k] = data[k] || []
    datacache[k] = datacache[k] || []
    const d = data[k].map(i => i)
    const dc = datacache[k].map(i => i)

    const paditem = { [key]: 0, [value]: 0 }

    if (d.length > dc.length) {
      DataAnalyzer.padArray(dc, d.length, paditem )
    } else if (d.length < dc.length) {
      DataAnalyzer.padArray(d, dc.length, paditem )
    }

    const comparisonArray = this.transpose(d.map(record => ({
      p: record[value],
      q: this.findByKey(dc, record[key], key, value),
    })))

    return comparisonArray
  }

  getComparisonData(data, datacache) {
    const prepare = (c, k, v) => this.createComparisonArrays({ ...data }, { ...datacache }, c, k, v)

    const payload = {
      amountStakedByPool: prepare('amountStakedByPool', 'key', 'value'),
      executionNodesByCountry: prepare('executionNodesByCountry', 'key', 'value'),
      executionNodesByClientBase: prepare('executionNodesByClientBase', 'key', 'value'),
      consensusNodesByCountry: prepare('consensusNodesByCountry', 'key', 'value'),
      consensusNodesByClient: prepare('consensusNodesByClient', 'key', 'value'),
      blocksByRelays: prepare('blocksByRelays', 'key', 'value'),
      blocksByBuilder: prepare('blocksByBuilder', 'key', 'value'),
      activityByBundler: prepare('activityByBundler', 'key', 'value'),
      stablecoinsByTvl: prepare('stablecoinsByTvl', 'key', 'value'),
      rollupsByTvl: prepare('rollupsByTvl', 'key', 'value'),
      nativeAssetsByAddress: prepare('nativeAssetsByAddress', 'key', 'value'),
      exchangeBySupply: prepare('exchangeBySupply', 'key', 'value'),
    }

    return payload
  }

  formatData(data) {
    const amountStakedByPool = data.amountStakedByPool ? data.amountStakedByPool.map(record => ({
      key: record.entity,
      value: record.amount_staked,
    })) : []

    const nativeAssetsByAddress = Object.entries(data.nativeAssetsByAddress).map(record => ({
      key: Number(record[0].replace('above_', '').replace('_', '.')),
      value: record[1],
    }))

    const exchangeBySupply = Object.entries(data.exchangeBySupply).map(record => ({
      key: record[0],
      value: record[1],
    }))
      .filter(i => i.value !== null)

    const activityByBundler = data.activityByBundler ? data.activityByBundler.map(record => ({
      key: record.bundler,
      value: record.numberTransactions,
    })) : []

    const stablecoinsByTvl = data.stablecoinsByTvl ? data.stablecoinsByTvl.map(record => ({
      key: record.symbol,
      value: record.TVL,
    })) : []

    const rollupsByTvl = data.rollupsByTvl ? data.rollupsByTvl.map(record => ({
      key: record.name,
      value: record.tvl || 0,
    })) : []

    const payload = {
      executionNodesByCountry: data.executionNodesByCountry,
      executionNodesByClientBase: data.executionNodesByClientBase,
      consensusNodesByCountry: data.consensusNodesByCountry,
      consensusNodesByClient: data.consensusNodesByClient,
      amountStakedByPool,
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
      ...acc, [cur[0]]: cur[1] ? DataAnalyzer.calculateGiniCoefficient(cur[1].map(i => i.value)) : 0
    }), {})

    const herfindahlHirschmanIndices = Object.entries(data).reduce((acc, cur) => ({
      ...acc, [cur[0]]: cur[1] ? DataAnalyzer.calculateHerfindahlHirschmanIndex(cur[1].map(i => i.value)) : 0
    }), {})

    const atkinsonIndex = Object.entries(data).reduce((acc, cur) => ({
      ...acc, [cur[0]]: cur[1] ? DataAnalyzer.calculateAtkinsonIndex(cur[1].map(i => i.value), 0.5) : 0
    }), {})

    const shannonEntropy = Object.entries(data).reduce((acc, cur) => ({
      ...acc, [cur[0]]: cur[1] ? DataAnalyzer.calculateShannonEntropy(cur[1].map(i => i.value)) : 0
    }), {})

    const P90P10 = Object.entries(data).reduce((acc, cur) => ({
      ...acc, [cur[0]]: cur[1] ? DataAnalyzer.calculateRatio(cur[1].map(i => i.value), 90, 10) : 0
    }), {})

    return { giniCoefficients, herfindahlHirschmanIndices, atkinsonIndex, shannonEntropy, P90P10 }
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

  static calculateInterDecileRatio(rawdata, lowerPercentile, upperPercentile) {
    const data = rawdata.sort((a, b) => a - b)

    const lowerValue = DataAnalyzer.calculatePercentile(data, lowerPercentile)
    const upperValue = DataAnalyzer.calculatePercentile(data, upperPercentile)

    const ratio = (upperValue / lowerValue) // / data.reduce((acc, cur) => acc + cur, 0)

    return Math.abs(ratio.toFixed(2))
  }

  static calculateDeciles(data, deciles) {
    // First sort the data
    data.sort((a, b) => a - b)

    let results = {}

    deciles.forEach((decile) => {
      // calculate the rank of the decile
      let rank = decile / 100.0 * (data.length + 1)

      // identify the surrounding data points
      let lowerRank = Math.floor(rank)
      let upperRank = lowerRank + 1

      // account for the fact that array is zero indexed
      let lowerValue = data[lowerRank - 1]
      let upperValue = data[upperRank - 1]

      if (lowerValue === undefined) {
        // special case for the lowest decile
        results[decile] = upperValue
      } else if (upperValue === undefined) {
        // special case for the highest decile
        results[decile] = lowerValue
      } else {
        // calculate the interpolated value
        let fraction = rank - lowerRank

        results[decile] = lowerValue + (upperValue - lowerValue) * fraction
      }
    })

    return results
  }

  // to convert the ratio to a percentage, multiply it by 100.
  // e.g. if the P90:P10 ratio is 2.5, the income at the 90th
  // percentile is 250% of the income at the 10th percentile.
  static calculateRatio(data, decile1, decile2) {
    let deciles = DataAnalyzer.calculateDeciles(data, [decile1, decile2])

    const ratio = deciles[decile1] / deciles[decile2]

    const sum = data.reduce((a, c) => a+c, 0)

    const delta = ratio / sum

    return Math.floor(ratio * 100)
  }
}

module.exports = DataAnalyzer

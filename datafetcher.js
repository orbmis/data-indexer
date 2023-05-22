const fs = require('fs')
const path = require('path')
const axios = require('axios')
const mongoose = require('mongoose')
const sleep = require('util').promisify(setTimeout)
const util = require('util')
const cheerio = require('cheerio')

// https://www.relayscan.io/builder-profit?t=24h
// https://www.relayscan.io/builder-profit/md

class DataFetcher {
  constructor() {
    // initialize variables
  }

  async getData() {
    let data = {}

    const countryCodes = require('./country-codes.json')
    const countries = countryCodes.reduce((acc, cur) => ({ ...acc, [cur.code]: cur.country }), {})

    const log = msg => console.log(`\n[${new Date().toISOString()}] ${msg}`)

    console.log('\nRunning report . . .\n')

    let blockBuilderData

    try {
      log('Querying Relayscan . . .')

      blockBuilderData = await this.getBlockBuilderData()
    } catch(e) {
      log(e.message)
    }

    let executionNodesByCountry

    try {
      log('Querying Ethernodes . . .')

      executionNodesByCountry = await this.getExecutionNodesByCountry()
    } catch(e) {
      log(e.message)
    }

    await sleep(1000)

    let executionNodesByClientBase

    try {
      log('Querying Ethernodes . . .')

      executionNodesByClientBase = await this.getExecutionNodesByClientBase()
    } catch (e) {
      log(e.message)
    }

    let consensusNodesByCountry

    try {
      log('Querying Miga Labs (countries) . . .')

      consensusNodesByCountry = await this.getConsensusNodesByCountry(countries)
    } catch (e) {
      log(e.message)
    }

    await sleep(1000)

    let consensusNodesByClient

    try {
      log('Querying Miga Labs (clients) . . .')

      consensusNodesByClient = await this.getConsensusNodesByClient()
    } catch (e) {
      log(e.message)
    }

    let amountStakedByPool

    try {
      log('Querying Dune Analytics (stakng pools) . . .')

      amountStakedByPool = await this.getAmountStakedByPool()
    } catch (e) {
      log(e.message)
    }

    let stablecoinsByTvl

    try {
      log('Querying DefiLlama (stablecoins) . . .')

      stablecoinsByTvl = await this.getStablecoinsByTvl()
    } catch (e) {
      log(e.message)
    }

    let activityByBundler

    try {
      log('Querying Dune Analytics (4337 bundlers) . . .')

      activityByBundler = await this.getActivityByBundler()
    } catch (e) {
      log(e.message)
    }

    let blocksByRelays, blocksByBuilder

    try {
      log('Querying mevboost.org . . .')

      const result = await this.getBlockProposedByBuilder()

      blocksByRelays = result.blocksByRelays
      blocksByBuilder = result.blocksByBuilder
    } catch (e) {
      log(e.message)
    }

    let messariData, nativeAssetsByAddress, exchangeBySupply

    try {
      log('Querying Messari . . .')

      messariData = await this.getMessariData()

      nativeAssetsByAddress = messariData.asset_distribution
      exchangeBySupply = messariData.exchange_supply_native
    } catch (e) {
      log(e.message)
    }

    let rollupsByTvl

    try {
      log('Querying L2Beat . . .')

      rollupsByTvl = await this.getRollupsByTvl()
    } catch (e) {
      log(e.message)
    }

    let bridgesByTvl

    try {
      log('Querying DefiLlama (bridges) . . .')

      bridgesByTvl = await this.getBridgesByTvl()
    } catch (e) {
      log(e.message)
    }


    data = {
      ...data,
      executionNodesByCountry,
      executionNodesByClientBase,
      consensusNodesByCountry,
      consensusNodesByClient,
      amountStakedByPool,
      blockBuilderData,
      blocksByRelays,
      blocksByBuilder,
      nativeAssetsByAddress,
      exchangeBySupply,
      activityByBundler,
      stablecoinsByTvl,
      rollupsByTvl,
      bridgesByTvl,
    }

    const datestring = new Date().toISOString().slice(0, 10)

    const datafile = path.resolve(__dirname, `data_${datestring}.json`)

    fs.writeFileSync(datafile, JSON.stringify(data, null, 2), 'utf8')

    return data
  }

  // TODO: https://www.relayscan.io/overview/md
  async getBlockBuilderData() {
    const res = await axios.get('https://www.relayscan.io/builder-profit/md')
    const data = res && res.data
    const parsedData = data.split('\n').slice(5, -1).map(n => n.split('|').slice(1, -1).map(i => i.trim()))

    const result = parsedData.map(k => ({
      builderExtraData: k[0],
      blocks: Number(k[1]),
      blocksProfit: Number(k[2]),
      blocksSubsidy: Number(k[3]),
      profitTotal: Number(k[4]),
      subsidiesTotal: Number(k[5]),
    }))

    return result
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

    const payload = {
      executionNodesByCountry: data.executionNodesByCountry,
      executionNodesByClientBase: data.executionNodesByClientBase,
      consensusNodesByCountry: data.consensusNodesByCountry,
      consensusNodesByClient: data.consensusNodesByClient,
      amountStakedByPool,
      blocksByRelays,
      blocksByBuilder,
      nativeAssetsByAddress,
      exchangeBySupply
    }

    return payload
  }

  getGiniCoefficients(data) {
    const keys = Object.keys(data)

    data.nativeAssetsByAddress = DataFetcher.normalizeNAtiveAssetDistribution(data.nativeAssetsByAddress)

    const giniCoefficients = Object.entries(data).reduce((acc, cur) => ({
      ...acc, [cur[0]]: DataFetcher.calculateGiniCoefficient(cur[1].map(i => i.value))
    }), {})

    const herfindahlHirschmanIndices = Object.entries(data).reduce((acc, cur) => ({
      ...acc, [cur[0]]: DataFetcher.calculateHerfindahlHirschmanIndex(cur[1].map(i => i.value))
    }), {})

    console.log('\nHerfindahl-Hirschman Indices:\n', herfindahlHirschmanIndices)

    console.log('\nGini Coefficients:\n')

    return giniCoefficients
  }

  static normalizeNAtiveAssetDistribution(data) {
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

    return atkinsonIndex
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
    
    return entropy
  }

  async getBlockProposedByBuilder() {
    const builderMapping = require('./builder-mapping.json')

    const builders = builderMapping.reduce((acc, cur) => ({ ...acc, [cur.address]: cur.name }), {})

    const res = await axios.get('https://www.mevboost.org/stats')

    const blocksByRelays = res.data.relays

    const blocksByBuilder = res.data.builders.map((b) => ({
      ...b,
      name: builders[b.pubkey] || b.pubkey,
    }))

    return { blocksByRelays, blocksByBuilder }
  }

  // measures transactions to entrypoint contract on mainnet
  // https://dune.com/queries/2490033
  async getActivityByBundler() {
    const url = 'https://api.dune.com/api/v1/query/2490033/results?api_key='

    const apiKey = 'pEnrXN8hLJOkxYVT4hnok6FsY8KbVp5o'

    const res = await axios.get(url.concat(apiKey))

    const bundlerData = res.data && res.data.result.rows

    const data = bundlerData.map((record) => ({
      bundler: record.bundler,
      numberTransactions: record.number_transactions,
    }))

    return data
  }

  async getAmountStakedByPool() {
    const url = 'https://api.dune.com/api/v1/query/2394100/results?api_key='

    const apiKey = 'pEnrXN8hLJOkxYVT4hnok6FsY8KbVp5o'

    const res = await axios.get(url.concat(apiKey))

    const stakingData = res.data && res.data.result.rows

    const data = stakingData.map((pool) => ({
      amount_staked: pool.amount_staked,
      entity: pool.entity,
      entity_category: pool.entity_category,
      marketshare: pool.marketshare,
      validators: pool.validators,
    }))

    return data
  }

  async getBridgesByTvl() {
    const res = await axios.get('https://bridges.llama.fi/bridges')

    const data = res.data && res.data.bridges

    const bridgeIds = data.filter(d => d.chains.includes('Ethereum')).map(d => d.id)

    const bridgeData = await Promise.all(bridgeIds.map(async (id) => {
      await sleep(500)

      return await DataFetcher.getBridgeData(id)
    }))

    return bridgeData
  }

  static async getBridgeData(bridgeId) {
    const res = await axios.get('https://bridges.llama.fi/bridge/' + bridgeId)

    const data = res.data

    const result = {
      name: data.displayName,
      totalVolume: Math.floor(data.lastDailyVolume),
      ethereumVolume: Math.floor(data.chainBreakdown.Ethereum.currentDayVolume),
      numberDeposits: data.chainBreakdown.Ethereum.currentDayTxs.deposits,
      numberWithdrawals: data.chainBreakdown.Ethereum.currentDayTxs.withdrawals,
    }

    return result
  }

  async getStablecoinsByTvl() {
    const res = await axios.get('https://stablecoins.llama.fi/stablecoins?includePrices=true')

    const data = res.data && res.data.peggedAssets

    const ethereumStablecoins = data.filter(d => d.chains.includes('Ethereum'))

    const usdValues = ethereumStablecoins.map(d => ({
      name: d.name,
      symbol: d.symbol,
      TVL: Math.floor(d.chainCirculating.Ethereum.current.peggedUSD),
    }))
    .filter(d => !isNaN(d.TVL))

    // TODO: convert euro price to USD
    const eurValues = ethereumStablecoins.map(d => ({
      name: d.name,
      symbol: d.symbol,
      TVL: Math.floor(d.chainCirculating.Ethereum.current.peggedEUR),
    }))
    .filter(d => !isNaN(d.TVL))

    return [ ...usdValues, ...eurValues ]
  }

  async getRollupsByTvl() {
    const res = await axios.get('https://l2beat.com/scaling/tvl')

    const htmlString = res.data
    const $ = cheerio.load(htmlString)
    const firstTable = $('table:first')
    const tableCells = firstTable.find('tr > td')

    const cellTexts = tableCells.map(function(i, elem) {
      return $(this).text().replace(/\s\s+/g, ' ').trim()
    }).get()

    let result = []

    const chunkSize = 7

    for (let i = 0; i < cellTexts.length; i += chunkSize) {
      result.push(cellTexts.slice(i, i + chunkSize))
    }

    const data = result.map(r => ({
      name: r[1],
      technology: r[3],
      purpose: r[4],
      tvl: r[5],
      marketShare: r[6],
    }))

    const formatted = data.map(d => {
      const match = d.tvl.match(/^\$(.*)\s[BMK].*$/);
      let tvl = match ? match[1] : d.tvl;

      if (d.tvl.includes('B')) {
        tvl = tvl * 10**9
      } else if (d.tvl.includes('M')) {
        tvl = tvl * 10**6
      } else if (d.tvl.includes('K')) {
        tvl = tvl * 10**3
      } else {
        tvl = Math.floor(tvl.slice(1, -1))
      }

      return { ...d, tvl }
    })

    return formatted
  }

  async getExecutionNodesByCountry() {
    const res = await axios.get('https://www.ethernodes.org/countries')

    const pattern =
      /<li class="list-group-item"><a href=".+?">(.+?)<\/a><span class="list-group-progress" style=".+?"><\/span><span class="float-right text-muted">(.+?) \((.+?)\)<\/span><\/li>/g

    const found = res.data.matchAll(pattern)

    const nodes = []

    for (const match of found) {
      nodes.push({ key: match[1], value: Number(match[2]) })
    }

    return nodes
  }

  async getExecutionNodesByClientBase() {
    const res = await axios.get('https://www.ethernodes.org/')

    const pattern =
      /<li class="list-group-item"><a href=".+?">(.+?)<\/a><span class="list-group-progress" style=".+?"><\/span><span class="float-right text-muted">(.+?) \((.+?)\)<\/span><\/li>/g

    const found = res.data.matchAll(pattern)

    const nodes = []

    for (const match of found) {
      nodes.push({ key: match[1], value: Number(match[2]) })
    }

    return nodes
  }

  async getConsensusNodesByClient() {
    const res = await axios.get('https://migalabs.es/api/v1/client-distribution')

    const nodes = []

    Object.entries(res.data).forEach((record) => {
      nodes.push({ key: record[0], value: record[1] })
    })

    return nodes
  }

  async getConsensusNodesByCountry(countryCodes) {
    const res = await axios.get('https://migalabs.es/api/v1/geo-distribution')

    const nodes = []

    Object.entries(res.data).forEach((record) => {
      const country = countryCodes[record[0]] || record[0]

      nodes.push({ key: country, value: record[1] })
    })

    return nodes
  }

  async getMessariData() {
    const endpoint = `https://data.messari.io/api/v1/assets/ethereum/metrics`

    let res

    try {
      res = await axios.get(endpoint)
    } catch (e) {
      console.error(e.message)

      return {}
    }

    const supply = res.data.data.on_chain_data
    const exchanges = res.data.data.exchange_flows

    const data = {
      addresses_count: supply.addresses_count,
      active_addresses: supply.active_addresses,
      circulating_supply: res.data.data.supply.circulating,
      asset_distribution: {
        above_0_001: supply.addresses_balance_greater_0_001_native_units_count,
        above_0_01: supply.addresses_balance_greater_0_01_native_units_count,
        above_0_1: supply.addresses_balance_greater_0_1_native_units_count,
        above_1: supply.addresses_balance_greater_1_native_units_count,
        above_10: supply.addresses_balance_greater_10_native_units_count,
        above_100: supply.addresses_balance_greater_100_native_units_count,
        above_1000: supply.addresses_balance_greater_1k_native_units_count,
        above_10000: supply.addresses_balance_greater_10k_native_units_count,
        above_100000: supply.addresses_balance_greater_100k_native_units_count,
        above_1000000: supply.addresses_balance_greater_1m_native_units_count,
      },
      exchange_supply_native: {
        binance: exchanges.supply_binance_native_units,
        bitfinex: exchanges.supply_bitfinex_native_units,
        bitmex: exchanges.supply_bitmex_native_units,
        bitstamp: exchanges.supply_bitstamp_native_units,
        bittrex: exchanges.supply_bittrex_native_units,
        gemini: exchanges.supply_gemini_native_units,
        huobi: exchanges.supply_huobi_native_units,
        kraken: exchanges.supply_kraken_native_units,
        poloniex: exchanges.supply_poloniex_native_units,
      },
    }

    return data
  }
}

module.exports = DataFetcher

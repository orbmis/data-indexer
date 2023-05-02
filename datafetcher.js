const fs = require('fs')
const path = require('path')
const axios = require('axios')
const mongoose = require('mongoose')
const sleep = require('util').promisify(setTimeout)
const util = require('util')

class DataFetcher {
  constructor() {
    // initialize variables
  }

  async getData() {
    let data = {}

    const datafile = path.resolve(__dirname, 'data.json')

    if (fs.existsSync(datafile)) {
      const data = require(datafile)

      console.log('\nUsing cached data . . .')

      console.log(data)
      console.log()

      return data
    }

    const countryCodes = require('./country-codes.json')
    const countries = countryCodes.reduce((acc, cur) => ({ ...acc, [cur.code]: cur.country }), {})

    const executionNodesByCountry = await this.getExecutionNodesByCountry()
    await sleep(1000)
    const executionNodesByClientBase = await this.getExecutionNodesByClientBase()
    const consensusNodesByCountry = await this.getConsensusNodesByCountry(countries)
    await sleep(1000)
    const consensusNodesByClient = await this.getConsensusNodesByClient()
    const amountStakedByPool = await this.getAmountStakedByPool()
    const { blocksByRelays, blocksByBuilder } = await this.getBlockProposedByBuilder()

    const messariData = await this.getMessariData()
    const nativeAssetsByAddress = messariData.asset_distribution
    const exchangeByVolume = messariData.exchange_volume_native
    const exchangeBySupply = messariData.exchange_supply_native

    data = {
      ...data,
      executionNodesByCountry,
      executionNodesByClientBase,
      consensusNodesByCountry,
      consensusNodesByClient,
      amountStakedByPool,
      blocksByRelays,
      blocksByBuilder,
      nativeAssetsByAddress,
      exchangeByVolume,
      exchangeBySupply,
    }

    fs.writeFileSync(datafile, JSON.stringify(data, null, 2), 'utf8')

    return data
  }

  formatData(data) {
    // const keys = Object.keys(data)

    const executionNodesByCountry = data.executionNodesByCountry.map(record => ({
      key: record.country,
      value: record.nodes,
    }))

    const executionNodesByClientBase = data.executionNodesByCountry.map(record => ({
      key: record.client,
      value: record.nodes,
    }))

    const consensusNodesByCountry = data.consensusNodesByCountry.map(record => ({
      key: record.country,
      value: record.nodes,
    }))

    const consensusNodesByClient = data.consensusNodesByClient.map(record => ({
      key: record.client,
      value: record.nodes,
    }))

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
      key: record[0],
      value: record[1],
    }))

    const exchangeByVolume = Object.entries(data.exchangeByVolume).map(record => ({
      key: record[0],
      value: record[1],
    }))
    .filter(i => i.value !== null)

    const exchangeBySupply = Object.entries(data.exchangeBySupply).map(record => ({
      key: record[0],
      value: record[1],
    }))
    .filter(i => i.value !== null)

    const payload = {
      executionNodesByCountry,
      executionNodesByClientBase,
      consensusNodesByCountry,
      consensusNodesByClient,
      amountStakedByPool,
      blocksByRelays,
      blocksByBuilder,
      nativeAssetsByAddress,
      // exchangeByVolume,
      exchangeBySupply
    }

    return payload
  }

  getGiniCoefficients(data) {
    const keys = Object.keys(data)

    const giniCoefficients = Object.entries(data).reduce((acc, cur) => ({
      ...acc, [cur[0]]: DataFetcher.calculateGiniCoefficient(cur[1].map(i => Math.floor(i.value)))
    }), {})

    console.log('\nGini Coefficients:\n')

    return giniCoefficients
  }

  // https://www.wallstreetmojo.com/gini-coefficient/
  // https://economics.stackexchange.com/questions/16444/calculating-gini-coeffecient
  static calculateGiniCoefficient(data) {
    // the following row is test data
    // data = [10, 10, 10, 10, 10, 10, 20, 20, 20, 80]

    // Sort the data by value in increasing order
    const sorted = data.sort((a, b) => (a - b))

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

  async getBlockProposedByBuilder() {
    console.log('\nQuerying mevboost.org . . .')

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

  async getAmountStakedByPool() {
    console.log('\nQuerying Dune Analytics . . .')

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

  async getExecutionNodesByCountry() {
    console.log('\nQuerying Ethernodes . . .')

    const res = await axios.get('https://www.ethernodes.org/countries')

    const pattern =
      /<li class="list-group-item"><a href=".+?">(.+?)<\/a><span class="list-group-progress" style=".+?"><\/span><span class="float-right text-muted">(.+?) \((.+?)\)<\/span><\/li>/g

    const found = res.data.matchAll(pattern)

    const nodes = []

    for (const match of found) {
      nodes.push({ country: match[1], nodes: Number(match[2]) })
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
      nodes.push({ client: match[1], nodes: Number(match[2]) })
    }

    return nodes
  }

  async getConsensusNodesByClient() {
    console.log('\nQuerying Miga Labs (clients) . . .')

    const res = await axios.get('https://migalabs.es/api/v1/client-distribution')

    const nodes = []

    Object.entries(res.data).forEach((record) => {
      nodes.push({ client: record[0], nodes: record[1] })
    })

    return nodes
  }

  async getConsensusNodesByCountry(countryCodes) {
    console.log('\nQuerying Miga Labs (countries) . . .')

    const res = await axios.get('https://migalabs.es/api/v1/geo-distribution')

    const nodes = []

    Object.entries(res.data).forEach((record) => {
      const country = countryCodes[record[0]] || record[0]

      nodes.push({ country: country, nodes: record[1] })
    })

    return nodes
  }

  async getMessariData() {
    console.log('\nQuerying Messari . . .')

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
      market_cap: res.data.data.marketcap.current_marketcap_usd,
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
      exchange_volume_native: {
        binance: exchanges.flow_net_binance_native_units,
        bitfinex: exchanges.flow_net_bitfinex_native_units,
        bitmex: exchanges.flow_net_bitmex_native_units,
        bitstamp: exchanges.flow_net_bitstamp_native_units,
        bittrex: exchanges.flow_net_bittrex_native_units,
        gemini: exchanges.flow_net_gemini_native_units,
        huobi: exchanges.flow_net_huobi_native_units,
        kraken: exchanges.flow_net_kraken_native_units,
        poloniex: exchanges.flow_net_poloniex_native_units,
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

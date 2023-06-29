const fs = require('fs')
const path = require('path')
const axios = require('axios')
const mongoose = require('mongoose')
const sleep = require('util').promisify(setTimeout)
const util = require('util')
const cheerio = require('cheerio')

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
      log('Querying Relayscan (builder profit) . . .')

      blockBuilderData = await this.getBlockBuilderData()
    } catch(e) {
      log(e.message)
    }

    await sleep(1000)

    let blocksByRelays, blocksByBuilder

    try {
      log('Querying relayscan (overview) . . .')

      const result = await this.getBlockProposedByBuilderAndRelay()

      blocksByRelays = result.blocksByRelays
      blocksByBuilder = result.blocksByBuilder
    } catch (e) {
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

  async getBlockProposedByBuilder_defunkt() {
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

  async getBlockProposedByBuilderAndRelay() {
    const res = await axios.get('https://www.relayscan.io/overview/md')
    const data = res && res.data
    const splitData = data.split('```')
    const relayData = splitData[1]
    const builderData = splitData[3]

    const parsedRelayData = relayData.split('\n').slice(5, -1).map(n => n.split('|').slice(1, -1).map(i => i.trim()))
    const parsedBuilderData = builderData.split('\n').slice(5, -1).map(n => n.split('|').slice(1, -1).map(i => i.trim()))

    const blocksByRelays = parsedRelayData.map(([relay, payloads, share]) => ({
      relay,
      payloads: Number(payloads.replaceAll(',', '')),
      share: Number(share),
    }))

    const blocksByBuilder = parsedRelayData.map(([builder, blocks, share]) => ({
      builder,
      blocks: Number(blocks.replaceAll(',', '')),
      share: Number(share),
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

    const chunkSize = 8

    for (let i = 0; i < cellTexts.length; i += chunkSize) {
      result.push(cellTexts.slice(i, i + chunkSize))
    }

    const data = result.map(r => ({
      name: r[1],
      technology: r[3],
      purpose: r[4],
      tvl: r[6],
      marketShare: r[7],
    }))

    const formatted = data.map(d => {
      if (!d.tvl) {
        return d
      }

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

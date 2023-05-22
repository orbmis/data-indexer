// https://onestopdataanalysis.com/shannon-entropy
function estimateShannonEntropy(dnaSequence) {
  const m = dnaSequence.length
  const bases = {}
  
  for (let i = 0; i < m; i++) {
    const base = dnaSequence[i]

    if (!bases[base]) {
      bases[base] = 0
    }

    bases[base]++
  }

  let shannonEntropyValue = 0

  for (const base in bases) {
    const n_i = bases[base]
    const p_i = n_i / m
    const entropy_i = p_i * (Math.log2(p_i))

    shannonEntropyValue += entropy_i
  }

  return -1 * shannonEntropyValue
}

// https://gist.github.com/jabney/5018b4adc9b2bf488696
function calculateShannonEntropy(text) {
  const textLength = text.length

  // find symbolCount of all symbols
  const symbolCount = {}

  for (let i = 0; i < textLength; i++) {
    const symbol = text[i]

    if (symbolCount[symbol] === undefined) {
      symbolCount[symbol] = 1
    } else {
      symbolCount[symbol]++
    }
  }

  let complexity = 0
  const allCounts = Object.values(symbolCount)
  const allCountsLength = allCounts.length

  for (let i = 0; i < allCountsLength; i++) {
    complexity = complexity - allCounts[i] / textLength * Math.log2(allCounts[i] / textLength)
  }

  return complexity
}

// chatGPT
function calculateEntropy(data) {
  const bases = {}
  
  for (let i in data) {
    const base = data[i]

    if (!bases[base]) {
      bases[base] = 0
    }

    bases[base]++
  }

  const total = Object.values(bases).reduce((acc, value) => acc + value, 0)
  const probabilities = Object.values(bases).map(value => value / total)
  const informationContent = probabilities.map(probability => Math.log2(probability))
  const entropy = probabilities.reduce((acc, probability, index) => acc - probability * informationContent[index], 0)

  return entropy
}

function getEntropy(data) {
  const bases = {}
  
  for (let i in data) {
    const base = data[i]

    if (!bases[base]) {
      bases[base] = 0
    }

    bases[base]++
  }

  let total = 0

  for (let exchange in bases) {
    total += bases[exchange]
  }

  let probabilities = []

  for (let exchange in bases) {
    probabilities.push(bases[exchange] / total)
  }

  let informationContent = []

  for (let i = 0; i < probabilities.length; i++) {
    informationContent.push(Math.log2(probabilities[i]))
  }

  let entropy = 0

  for (let i = 0; i < probabilities.length; i++) {
    entropy -= probabilities[i] * informationContent[i]
  }

  return entropy
}


const testValue = 'AGCTTTTCATTCTGACTGCAACGGGCAATATGTCTCTGTGTGGATTAAAAAAAGAGTGTCTGATAGCAGC'

const entropy = estimateShannonEntropy(testValue)
const otherEntropy = calculateEntropy(testValue)
const endEntropy = calculateShannonEntropy(testValue)
const doEntropy = getEntropy(testValue)

console.log(entropy, otherEntropy, endEntropy, doEntropy)

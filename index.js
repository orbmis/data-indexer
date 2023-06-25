const DataFetcher = require('./datafetcher')
const DataAnalyzer = require('./dataanalyzer')

const dataFetcher = new DataFetcher()

const dataAnalyzer = new DataAnalyzer()

if (process.argv[process.argv.length - 1] === 'analyze') {
  console.log('\nAnalyzing data . . . ')
  dataAnalyzer.loadData()
} else {
  dataFetcher.getData()
}

/*
dataFetcher.getData()
  .then(dataFetcher.formatData)
  .then(dataFetcher.getGiniCoefficients)
  .then(console.log)
*/

/**
 * The Atkinson index: This is a measure of inequality that takes into account the distribution of income or wealth beyond a certain threshold. It is calculated as a weighted average of the percentage of income or wealth held by each individual or group, where the weight for each group depends on their level of income or wealth.
 * The Theil index: This is a measure of inequality that considers the information content of the distribution, based on the concept of entropy from information theory. It is calculated as the ratio of the actual entropy of the distribution to the maximum possible entropy of a perfectly equal distribution.
 * The Hoover index: This is a measure of inequality that is based on the concept of the Lorenz curve, like the Gini coefficient. It is calculated as the area between the Lorenz curve and a line of perfect equality, divided by the total area under the line of perfect equality.
 * The coefficient of variation: This is a measure of relative inequality, which expresses the standard deviation of a distribution as a percentage of the mean. It is useful for comparing the inequality of distributions with different means.
 * The decile ratio: This is a simple measure of inequality that compares the income or wealth of the top 10% of a population to the income or wealth of the bottom 10%.
 */

// https://en.wikipedia.org/wiki/Herfindahl%E2%80%93Hirschman_index
// https://www.frontiersin.org/articles/10.3389/fpsyg.2021.716164/full
// https://www.frontiersin.org/files/Articles/716164/fpsyg-12-716164-HTML/image_m/fpsyg-12-716164-t001.jpg
// https://en.wikipedia.org/wiki/Atkinson_index
// https://github.com/open-risk/concentrationMetrics

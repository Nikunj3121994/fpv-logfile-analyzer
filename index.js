#!/usr/bin/env node

const fs = require('fs');
const _ = require('underscore');
const split = require('split');
const renderChart = require('node-chartist');
const handlebars = require('handlebars');
const promisify = require('es6-promisify');
const path = require('path');
const commander = require('commander');
const moment = require('moment');

const regex = new RegExp("[^\\n\\r\\t ]+",'g');
const templateFile = './template.hbs';
const timestampIndex = 0;
const socketIndex = 1;
const energyIndex = 4;
const powerIndex = 6;

// options defaults
let inputFile = 'logs/Stck2-21122017-1415Uhr.txt'; 
let outputFile = 'index.html';
let dataFactor = 100; // indicates, how much data is retrieved from files, value = 2 => every 2nd..
let fetchEnergy = false;

/*
#######################
#######################
######## L I B ########
#######################
#######################
*/

/**
 * 
 * @param [Array of Arrays] dataObject, e.g.
 * [['2018-05-02_00:24:42',
    'Steckdose1_Pwr',
    'eState:',
    'E:',
    '469.1',
    'P:',
    '193.41',
    'I:',
    '855',
    'U:',
    '231.2',
    'f:',
    '49.98'],
    [....]]
 * @returns e.g.{
        fromTo: '2018-05-01_22:00:24 - 2018-05-05_00:58:11',
        calculatedHours: 7,
        usedEnergy: 900,
        averagedPower: 200
      }
 */
const calculateStatistics = (dataObject) => {
  let result = {
    fromTo: '',
    calculatedHours: 0,
    usedEnergy: 0,
    averagedPower: 0
  };

  const timestampFormat = 'YYYY-MM-DD_hh:mm:ss';
  const outTimeFormat = 'DD.MM.YYYY hh:mm:ss';

  // fromTo
  let startDate = moment(dataObject[0][timestampIndex], timestampFormat);
  let endDate = moment(dataObject[dataObject.length - 1][timestampIndex], timestampFormat);
  result.fromTo = `${startDate.format(outTimeFormat)} - ${endDate.format(outTimeFormat)}`; 

  // calculatedHours
  result.calculatedHours = moment.duration(endDate.diff(startDate)).asHours();
  result.calculatedHours = Math.round(result.calculatedHours * 100) / 100;

  // usedEnergy, only last energy entry of log file
  result.usedEnergy = parseFloat(dataObject[dataObject.length - 1][energyIndex]);

  // averagedPower
  let sum = 0;
  _.forEach(dataObject, o => {
    sum += parseFloat(o[powerIndex]);
  });
  result.averagedPower = Math.round((sum / dataObject.length) * 100) / 100;

  return result;
};

/** Converts input stream of a log file to structured json object, which can be used for chartist.js
 * @param [Array of Arrays] outData, e.g.
 * [['2018-05-02_00:24:42',
    'Steckdose1_Pwr',
    'eState:',
    'E:',
    '469.1',
    'P:',
    '193.41',
    'I:',
    '855',
    'U:',
    '231.2',
    'f:',
    '49.98'],
    [....]]

 * @returns e.g.
    {
      label: Steckdose1_Pwr,
      chartData: { 
        labels: [ '2018-05-02_00:24:42',  ... ],
        series: [ [ '193.41', ... ] ]
      },
      statistics: { ... }
    }
 */
const convertStreamToJSON = (outData) => {

  // predefine result-structure
  let result = {
    label: outData[0][socketIndex],
    chartData: {
      labels: [],
      series: [[]]
    },
    statistics: calculateStatistics(outData)
  };

  // TODO: issue #6 convert timestamps

  // calculate chartData
  _.each(outData, (od, index) => {
    if (index % dataFactor == 0) {
      result.chartData.labels.push(od[timestampIndex]);
      result.chartData.series[0].push(od[fetchEnergy ? energyIndex: powerIndex]);
    }
  });

  console.log(`Socket ${result.label}: ${result.chartData.labels.length} from overall ${outData.length} data points were retrieved for chart (factor ${dataFactor})`);

  return result;
}

/**
 * retrieves log-file data from given input file
 * @param {String} inPath - the input file
 */
const readFile = (inPath) => {
  
  let index = 0;
  let outData = [];

  let readStream = fs.createReadStream(inPath)
    .pipe(split())
    .on('data', (line) => {

      line = line.toString().match(regex);

      if(line){
          // array, no keys
          outData.push(line);
          index++;
      }
    });

  readStream.on('end', () => {
    writeDiagram(convertStreamToJSON(outData));
  });
}

/**
 * renders the node-chartist chart from given dataObject
 * @param {} dataObject, e.g.
 * {
      label: Steckdose1_Pwr,
      chartData: { 
        labels: [ '2018-05-02_00:24:42',  ... ],
        series: [ [ '193.41', ... ] ]
      },
      statistics: { see above }
    }
 */
const writeDiagram = (dataObject) => {
  const options = {
    width: 2000, 
    height: 1000,
    axisY: { title: fetchEnergy ? 'Energie E in WS' : 'Leistung P in W'},
    axisX: { title: 'Datum' }
  };

  renderChart('line', options, dataObject.chartData).then(chartDiv => {
    // render to output-file with handlebars
    return promisify(fs.readFile)(path.join(__dirname, templateFile)).then(res => {
      let source = res.toString();
        let template = handlebars.compile(source);
        let html = template({
          chartDiv: chartDiv,
          chartTitle: dataObject.label,
          statistics: dataObject.statistics
        });

        return promisify(fs.writeFile)(outputFile, html).then(res => {
          console.log(`The chart was rendered in ${outputFile}!`);
        }).catch(err => {
          console.log(err);
        });
      });
    });
}

/*
#######################
#######################
####### M A I N #######
#######################
#######################
*/

// input cli arguments

commander
  .version('0.1.0')
  .option('-i, --input-file <path>', "Add an input file, e.g. 'logs/Stck2-21122017-1415Uhr.txt'")
  .option('-o, --output-file <path>', "Add an output file, e.g. 'index.html'")
  .option('-d, --data-factor <number>', 'Add an data-factor, e.g. 100')
  .option('-f, --fetchEnergy <boolean>', 'Whether to fetch energy or power data')
  .parse(process.argv);

inputFile = commander.inputFile || inputFile;
outputFile = commander.outputFile || outputFile;
dataFactor = commander.dataFactor || dataFactor;
fetchEnergy = commander.fetchEnergy || fetchEnergy;

readFile(inputFile);
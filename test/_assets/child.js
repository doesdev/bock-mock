import bock from '../../index.js'

const levels = { debug: true, info: true, warn: true, fatal: true }
const logLevel = levels[process.argv[2]] ? process.argv[2] : 'debug'
const msgLevel = levels[process.argv[3]] ? process.argv[3] : logLevel
const msg = process.argv[4] || logLevel
const logger = bock({ appName: 'a', logLevel, toConsole: true, toFile: false })

logger[msgLevel](new Error(msg))

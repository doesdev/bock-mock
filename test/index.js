import test from 'mvt'
import fs from 'node:fs'
import path from 'node:path'
import bock from '../index.js'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const assets = path.resolve(__dirname, '_assets')
const childPath = path.join(assets, 'child.js')
const seenLogs = {}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const clearAll = (loggers) => {
  if (loggers) {
    if (Array.isArray(loggers)) {
      loggers.forEach((logger) => logger.close())
    } else {
      loggers.close()
    }
  }

  const logBase = getOpts().logBase
  try {
    const logFiles = fs.readdirSync(logBase).map((f) => path.join(logBase, f))

    logFiles.forEach((f) => {
      if (f.endsWith('.gitkeep')) return

      try {
        fs.unlinkSync(f)
      } catch (ex) {
        console.error(ex)
      }
    })
  } catch (ex) {
    console.error(ex)
  }
}

const getOpts = (override = {}) => Object.assign({}, {
  appName: 'bocktest',
  logBase: path.join(__dirname, '_logs'),
  logLevel: 'debug',
  toConsole: false,
  track: true
}, override)

const stripAnsi = (input) => {
  const rgx = new RegExp(
    '[\\u001B\\u009B][[()#;?]*' +
    '(?:\\d{1,4}(?:;\\d{0,4})*)?' +
    '[0-9A-ORZcf-nqry=><]',
    'g'
  )
  return input.replace(rgx, '')
}

const consoleResult = async (level, msgLevel, msg) => {
  const childArgs = [childPath, level, msgLevel, msg].filter((a) => a)
  const child = spawn(process.argv[0], childArgs)

  return stripAnsi(await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.stdout.on('data', (data) => resolve(data.toString()))
    child.stderr.on('data', (data) => resolve(data.toString()))
  })).trim()
}

const fileResultJson = (logFile) => {
  const nld = fs.readFileSync(logFile, 'utf8').trim().split('\n').join(',')
  return JSON.parse(`[${nld}]`)
}

const fileResult = async (opts, logThings) => {
  opts = typeof opts === 'string' ? { appName: opts } : (opts || {})

  const logOpts = getOpts(opts)
  const logger = bock(logOpts)
  const { appName, logBase } = logOpts

  if (seenLogs[appName]) throw new Error('Tests require unique appName')

  seenLogs[appName] = true

  await logThings(logger)
  await delay(opts.delay || 100)

  const logFile = fs.readdirSync(logBase).find((f) => f.includes(appName))
  const log = fileResultJson(path.resolve(logBase, logFile))

  clearAll(logger)

  console.log(log)

  return log
}

test.before(() => clearAll())

test.after(() => clearAll())

test('file written as line delimited JSON', async (assert) => {
  const log = await fileResult('nld-json', (logger) => {
    logger.debug(new Error('debug'))
    logger.info(new Error('info'))
    logger.warn(new Error('warn'))
    logger.fatal(new Error('fatal'))
  })

  assert.is(log[0].level, 'debug')
  assert.is(log[1].level, 'info')
  assert.is(log[2].level, 'warn')
  assert.is(log[3].level, 'fatal')
})

test('circular reference', async (assert) => {
  const opts = getOpts({ appName: 'circular', toFile: false, toConsole: false })
  const logger = bock(opts)
  const err = new Error('debug')
  const meta = { error: err }

  err.meta = meta

  assert.notThrows(() => logger.debug(err))
})

test('console output is as expected', async (assert) => {
  // debug
  assert.truthy((await consoleResult('debug')).match(/^DEBUG/))

  // info
  assert.truthy((await consoleResult('info')).match(/^INFO/))

  // warn
  assert.truthy((await consoleResult('warn')).match(/^WARN/))

  // fatal
  assert.truthy((await consoleResult('fatal')).match(/^FATAL/))

  clearAll()
})

test('function as error', async (assert) => {
  const log = await fileResult('function', (logger) => {
    logger.fatal(() => new Error('functioned'))
  })

  assert.is(log[0].level, 'fatal')
  assert.is(log[0].message, 'functioned')
})

test('transform error text', async (assert) => {
  const log = await fileResult('transform', (logger) => {
    logger.fatal(new Error('fatal'), (t) => t.replace('ata', 'ootbal'))
  })

  assert.is(log[0].message, 'football')
})

test('includePid functions as expected', async (assert) => {
  const exclude = await fileResult('includePid false or omitted', (logger) => {
    logger.fatal('should not include pid')
  })

  assert.falsy(exclude[0].pid)

  const includeOpts = { appName: 'includePid true', includePid: true }
  const include = await fileResult(includeOpts, (logger) => {
    logger.fatal('should include pid')
  })

  assert.truthy(include[0].pid)
})

test('includeHost functions as expected', async (assert) => {
  const exclude = await fileResult('includeHost false or omitted', (logger) => {
    logger.fatal('should not include hostname')
  })

  assert.falsy(exclude[0].hostname)

  const includeOpts = { appName: 'includeHost true', includeHost: true }
  const include = await fileResult(includeOpts, (logger) => {
    logger.fatal('should include hostname')
  })

  assert.truthy(include[0].hostname)
})

test('whitelist', async (assert) => {
  const opts = { appName: 'whitelist', whitelist: ['info'] }
  const log = await fileResult(opts, (logger) => {
    logger.debug(new Error('debug'))
    logger.info(new Error('info'))
    logger.warn(new Error('warn'))
    logger.fatal(new Error('fatal'))
  })

  assert.is(log[0].level, 'debug')
  assert.is(log[1].level, 'warn')
  assert.is(log[2].level, 'fatal')
})

test('cached returns last instance', async (assert) => {
  const loggerInit = bock.cached(getOpts({ appName: 'cached' }))
  const loggerCached = bock.cached()

  assert.is(loggerInit, loggerCached)

  await delay(100)

  clearAll([loggerInit, loggerCached])
})

test('cached re-inits if cached needs opts', async (assert) => {
  const loggerNeedsOpts = bock.cached()
  const loggerReInit = bock.cached(getOpts({ appName: 'cache-reinit' }))
  const loggerCached = bock.cached()

  assert.not(loggerNeedsOpts, loggerReInit)
  assert.not(loggerNeedsOpts, loggerCached)
  assert.is(loggerReInit, loggerCached)

  await delay(100)

  clearAll([loggerNeedsOpts, loggerReInit, loggerCached])
})

test('can destructure', async (assert) => {
  const log = await fileResult('destructure', (logger) => {
    const { debug, info, warn, fatal } = logger

    debug(new Error('debug'))
    info(new Error('info'))
    warn(new Error('warn'))
    fatal(new Error('fatal'))
  })

  assert.is(log[0].level, 'debug')
  assert.is(log[1].level, 'info')
  assert.is(log[2].level, 'warn')
  assert.is(log[3].level, 'fatal')
})

test('stress test', async (assert) => {
  const opts = getOpts({ appName: 'stress' })
  const logger = bock(opts)
  const runs = 5000
  const start = Date.now()

  for (let i = 0; i < runs; i++) logger.debug(new Error(`debug: ${i + 1}`))

  const fin = Date.now()
  const ranFor = fin - start

  await delay(200)

  const logFile = path.resolve(opts.logBase, fs.readdirSync(opts.logBase)[0])
  const nld = fs.readFileSync(logFile, 'utf8').trim().split('\n').join(',')

  const log = JSON.parse(`[${nld}]`)

  assert.is(log.length, runs)
  assert.is(log[log.length - 1].message, `debug: ${runs}`)
  assert.true(ranFor < 10000)

  clearAll(logger)
})

import pino from 'pino'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const instances = {}

let cached

const PRIMITIVES = {
  string: true,
  number: true,
  boolean: true,
  symbol: true
}

const randar = () => {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  ).substring(0, 16)
}

const bock = (id, opts = {}) => {
  const {
    appName = 'bock',
    logBase = path.join(__dirname, 'logs'),
    logLevel: level = 'debug',
    toConsole = true,
    toFile = true,
    whitelist = [],
    track = false
  } = opts

  const transport = pino.transport({
    target: path.join(__dirname, 'bock-transport.js'),
    options: {
      appName,
      logBase,
      level,
      toConsole,
      toFile,
      whitelist,
      track
    }
  })

  const logger = pino(
    {
      level,
      name: appName,
      sync: false,
      formatters: { level: (label) => { return { level: label } } }
    },
    transport
  )

  const shimTransform = (errorIn, transform = opts.transform) => {
    if (!errorIn || typeof transform !== 'function') return errorIn

    const errFromFunc = typeof errorIn === 'function' && errorIn()
    const errFromStr = typeof errorIn === 'string' && { message: 'err' }
    const error = errFromFunc || errFromStr || errorIn
    const replaced = Object.getOwnPropertyNames(error).reduce((out, p) => {
      const val = error[p] || ''
      const primitive = PRIMITIVES[val]
      const replaced = transform(primitive ? val : JSON.stringify(val))
      out[p] = primitive ? replaced : JSON.parse(replaced)
      return out
    }, {})

    return replaced
  }

  const shimmed = (level) => (error, transform) => {
    return logger[level](shimTransform(error, transform))
  }

  return {
    id,
    debug: shimmed('debug'),
    info: shimmed('info'),
    warn: shimmed('warn'),
    fatal: shimmed('fatal'),
    setLogLevel: (lvl) => { logger.level = lvl },
    close: () => {
      delete instances[id]

      if (cached && cached.id === id) cached = undefined

      logger.flush ? logger.flush() : Promise.resolve()
    }
  }
}

const getNewInstance = (opts) => {
  const { singleton, appName } = opts || {}
  const single = singleton && appName
  const id = single || `${appName || 'bock'}-${Date.now()}-${randar()}`
  const instance = (instances[id] ||= bock(id, opts || {}))

  instance.needsOpts = !opts

  return instance
}

getNewInstance.cached = (opts) => {
  if (cached && cached.needsOpts && opts) return (cached = getNewInstance(opts))
  return (cached = cached || getNewInstance(opts))
}

export default getNewInstance

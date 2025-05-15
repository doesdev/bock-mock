import pino from 'pino'
import os from 'node:os'
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
    track = false,
    includePid = false,
    includeHost = false
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
      track,
      includePid,
      includeHost
    }
  })

  const base = {}

  if (includePid) base.pid = process.pid
  if (includeHost) base.hostname = os.hostname()

  const logger = pino(
    {
      level,
      name: appName,
      sync: false,
      base,
      errorKey: 'error',
      messageKey: 'message',
      formatters: { level: (label) => ({ level: label }) }
    },
    transport
  )

  const shimTransform = (errorIn, transform = opts.transform) => {
    const isFunction = typeof errorIn === 'function'
    const hasTransform = typeof transform === 'function'

    if (!errorIn || !(isFunction || hasTransform)) return errorIn

    const errFromFunc = typeof errorIn === 'function' && errorIn()
    const errFromStr = typeof errorIn === 'string' && { message: 'err' }
    const error = errFromFunc || errFromStr || errorIn

    if (!hasTransform) return error

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

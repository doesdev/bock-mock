import build from 'pino-abstract-transport'
import SonicBoom from 'sonic-boom'
import { once } from 'events'
import fs from 'fs'
import path from 'path'

const errProps = [
  'name',
  'type',
  'code',
  'message',
  'fileName',
  'lineNumber',
  'stack',
  'meta'
]

function today () {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const initCap = (str) => {
  str = str || ''
  return `${str.charAt(0).toUpperCase()}${str.slice(1)}`
}

const stringer = (obj) => {
  try {
    return JSON.stringify(obj)
  } catch (ex) {
    const newObj = {}
    Object.keys(obj || {}).forEach((k) => {
      try { newObj[k] = JSON.parse(JSON.stringify(obj[k])) } catch (e) { }
    })
    return JSON.stringify(newObj) || '{"bockError":"JSON.stringify failed"}'
  }
}

const consoleText = (log, level, time, props) => `
${level.toUpperCase()}:
  Timestamp: ${new Date(time).toLocaleString()}
  ${props.map((p) => {
    const val = typeof log[p] === 'object' ? stringer(log[p]) : log[p]
    return `${initCap(p)}: ${val}`
  }).join('\n  ')}
`.trim()

const formatError = (err = new Error(), { level } = {}) => {
  const time = Date.now()
  const log = { time, level }

  if (typeof err === 'string') {
    log.message = err
  } else {
    Object.assign(log, err)
    errProps.forEach((p) => { if (err[p]) log[p] = err[p] })
  }

  if (!log.name && !log.message) log.message = err

  const ignoreProps = { time: true, level: true }
  const props = Object.getOwnPropertyNames(log).filter((k) => !ignoreProps[k])

  return consoleText(log, level, time, props)
}

export default async (opts) => {
  const {
    appName,
    logBase,
    toConsole,
    toFile,
    whitelist
  } = opts

  let consoleDest
  if (toConsole) {
    consoleDest = new SonicBoom({ dest: 1, sync: false })
    await once(consoleDest, 'ready')
  }

  let fileDest
  if (toFile) {
    fs.mkdirSync(logBase, { recursive: true })
    const filePath = path.join(logBase, `${appName}-${today()}.log`)
    fileDest = new SonicBoom({ dest: filePath, mkdir: true, sync: false })
    await once(fileDest, 'ready')
  }

  return build(
    async function (source) {
      for await (const log of source) {
        if (!log) continue

        if (log.error?.constructor === Object) {
          errProps.forEach((p) => {
            if (p in log.error && !log[p]) log[p] = log.error[p]
          })

          delete log.error
        }

        const { name, message, level } = log

        if (whitelist.includes(name) || whitelist.includes(message)) continue

        if (consoleDest) consoleDest.write(formatError(log, { level }) + '\n')

        if (fileDest) fileDest.write(JSON.stringify(log) + '\n')
      }
    },
    {
      async close () {
        if (consoleDest) {
          consoleDest.end()
          await once(consoleDest, 'close')
        }

        if (fileDest) {
          fileDest.end()
          await once(fileDest, 'close')
        }
      }
    })
}

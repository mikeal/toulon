import https from 'https'
import { readFileSync } from 'fs'

const opts = () => ({
  key: readFileSync(new URL('./certs/server.key', import.meta.url)),
  cert: readFileSync(new URL('./certs/server.cert', import.meta.url))
})

const createServer = handler => https.createServer(opts(), handler)

const createHandler = opts => {
  const handler = async (req, res) => {
    if (opts.debug) console.log(req.method, req.url)
    if (req.url.startsWith('/_toulon/')) {
      res.setHeader('content-type', 'text/html')
      res.end(opts.tabs[req.url.slice('/_toulon/'.length)])
    } else {
      opts.handler(opts, req, res)
    }
  }
  return handler
}

const closeServer = server => new Promise((resolve, reject) => {
  server.close(e => {
    if (e) return reject(e)
    resolve()
  })
})

const instrument = (page, onError, onConsole) => {
  const promises = []
  promises.push(page.on('error', error => onError(error)))
  promises.push(page.on('pageerror', error => onError(error)))
  promises.push(page.on('console', msg => onConsole(msg)))
  return Promise.all(promises)
}

const run = async (puppeteer, opts) => {
  if (!puppeteer) throw new Error('Missing require argument "puppeteer"')
  opts = { port: 8881, host: '127.0.0.1', ...opts }
  opts.tabs = {}
  const handler = createHandler(opts)
  const server = createServer(handler)
  const open = new Promise((resolve, reject) => {
    server.listen(opts.port, opts.host, e => {
      if (e) return reject(e)
      resolve()
    })
  })
  const args = [
    '--no-sandbox',
    '--enable-experimental-web-platform-features',
    '--ignore-certificate-errors'
  ]
  const browser = await puppeteer.launch({ args })
  const tab = async (html, onError, onConsole, globals = {}) => {
    globals = { ...globals }
    const page = await browser.newPage()
    await instrument(page, onError, onConsole)
    const fns = {}
    for (const [key, value] of Object.entries(globals)) {
      if (typeof value === 'function') {
        fns[key] = value
        delete globals[key]
      }
    }
    for (const [key, value] of Object.entries(fns)) {
      page.exposeFunction(key, (...args) => value(...args))
    }
    await page.evaluateOnNewDocument((data) => {
      for (const [key, value] of Object.entries(data)) {
        window[key] = value
      }
    }, globals)
    await open
    const id = Math.random()
    opts.tabs[id.toString()] = html
    const url = `https://${opts.host}:${opts.port}/_toulon/${id}`
    page.goto(url)//, {waitUntil: 'networkidle0'})
    return page
  }

  const close = async () => {
    await browser.close()
    await closeServer(server)
  }

  return { tab, close }
}

export default run

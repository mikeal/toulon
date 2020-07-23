import https from 'https'
import { readFileSync } from 'fs'

const opts = {
  key: readFileSync('./certs/server.key'),
  cert: readFileSync('./certs/server.cert')
}

const createServer = handler => https.createServer(opts, handler)

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

const createIndex = async opts => {
  let str = '<html><body>'
  str += `
    <script>
      _toulonStart()
    </script>
    <script type="importmap">
    {
      "imports": {
        "test": "/fs/test.js"
      }
    }
    </script>
    <script type="module">
      import test from 'test'
      console.log('test')
    </script>
  `
  str += '</body></html>'
  return str
}

const closeServer = server => new Promise((resolve, reject) => {
  server.close(e => {
    if (e) return reject(e)
    resolve()
  })
})

const instrument = (page, opts) => {
  const promises = []
  promises.push(page.on('error', error => {
    if (opts.onError) opts.onError(error)
  }))
  promises.push(page.on('pageerror', error => {
    if (opts.onError) opts.onError(error)
  }))
  promises.push(page.on('console', msg => {
    if (opts.onConsole) return opts.onConsole(msg)
    console.log({ msg })
  }))
  return Promise.all(promises)
}

const run = async (puppeteer, opts) => {
  if (!puppeteer) throw new Error('Missing require argument "puppeteer"')
  const index = createIndex(opts)
  opts = { port: 8881, host: '127.0.0.1', index, ...opts }
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
  const tab = async html => {
    const page = await browser.newPage()
    await instrument(page)
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

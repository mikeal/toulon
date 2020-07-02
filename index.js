import puppeteer from 'puppeteer'
import https from 'https'
import { readFileSync } from 'fs'

const opts = {
  key: readFileSync('./certs/server.key'),
  cert: readFileSync('./certs/server.cert')
}

const createServer = handler => https.createServer(opts, handler)

const createHandler = opts => {
  const handler = async (req, res) => {
    console.log(req.method, req.url)
    if (req.url === '/') {
      res.setHeader('content-type', 'text/html')
      res.end(await opts.index)
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

const close = server => new Promise((resolve, reject) => {
  server.close(e => {
    if (e) return reject(e)
    resolve()
  })
})

const instrument = (page, opts) => {
  const toulon = {}
  const promises = []
  toulon.start = new Promise(resolve => {
    promises.push(page.exposeFunction('_toulonStart', resolve))
  })
  toulon.finish = new Promise((resolve, reject) => {
    promises.push(page.exposeFunction('_toulonFinish', resolve))
    promises.push(page.on('error', error => {
      reject(error)
    }))
    promises.push(page.on('pageerror', error => {
      reject(error)
    }))
  })
  promises.push(page.on('console', msg => console.log({msg})))
  page.toulon = toulon
  toulon.start.then(() => console.log('start'))
  toulon.finish.then(() => console.log('finish'))
  console.log('instrumented')
  return Promise.all(promises)
}

const run = async opts => {
  const index = createIndex(opts)
  opts = { port: 8881, host: '127.0.0.1', index, ...opts }
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
    '--enable-experimental-productivity',
    '--ignore-certificate-errors'
  ]
  const browser = await puppeteer.launch({args})
  const page = await browser.newPage()
  await instrument(page)
  await open
  const url = `https://${opts.host}:${opts.port}`
  page.goto(url)//, {waitUntil: 'networkidle0'})
  console.log('asdf')
  await page.toulon.finish
  console.log('done')

  await browser.close()
  await close(server)
}

run({files: [ 'test.js' ]}).catch(e => console.error(e))

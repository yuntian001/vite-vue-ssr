// @ts-check
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITE_TEST_BUILD

export async function createServer(
  root = process.cwd(),
  isProd = process.env.NODE_ENV === 'production',
  hmrPort
) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const resolve = (p) => path.resolve(__dirname, p)

  const indexProd = isProd
    ? fs.readFileSync(resolve('dist/client/index.html'), 'utf-8')
    : ''

  const manifest = isProd
    ? // @ts-ignore
      (await import('./dist/client/ssr-manifest.json')).default
    : {}

  const app = express()

  /**
   * @type {import('vite').ViteDevServer}
   */
  let viteTest;
  let viteTest2;

  if (!isProd) {
    viteTest = await (
      await import('vite')
    ).createServer({
      // base: '/test/',
      configFile:'test/vite.config.js',
      root:root+'/test',
      logLevel: isTest ? 'error' : 'info',
      server: {
        middlewareMode: true,
        watch: {
          // During tests we edit the files too fast and sometimes chokidar
          // misses change events, so enforce polling for consistency
          usePolling: true,
          interval: 100
        },
        hmr: {
          port: hmrPort
        }
      },
      appType: 'custom'
    })
    // use vite's connect instance as middleware
    app.use(viteTest.middlewares)
    viteTest2 = await (
      await import('vite')
    ).createServer({
      // base: '/test2/',
      configFile:'test2/vite.config.js',
      root:root+'/test2',
      logLevel: isTest ? 'error' : 'info',
      server: {
        middlewareMode: true,
        watch: {
          // During tests we edit the files too fast and sometimes chokidar
          // misses change events, so enforce polling for consistency
          usePolling: true,
          interval: 100
        },
        hmr: {
          port: hmrPort
        }
      },
      appType: 'custom'
    })
    // use vite's connect instance as middleware
    app.use(viteTest2.middlewares)
  } else {
    app.use((await import('compression')).default())
    app.use(
      '/test/',
      (await import('serve-static')).default(resolve('dist/client'), {
        index: false
      })
    )
  }

  app.use('*', async (req, res) => {
    try {
      if(req.originalUrl.startsWith('/test/')){
        const url = req.originalUrl.replace('/test/', '/')

        let template, render
        if (!isProd) {
          // always read fresh template in dev
          template = fs.readFileSync(resolve('test/index.html'), 'utf-8')
          template = await viteTest.transformIndexHtml(url, template)
          render = (await viteTest.ssrLoadModule('/src/entry-server.js')).render
        } else {
          template = indexProd
          // @ts-ignore
          render = (await import('./dist/server/entry-server.js')).render
        }
  
        const [appHtml, preloadLinks] = await render(url, manifest)
  
        const html = template
          .replace(`<!--preload-links-->`, preloadLinks)
          .replace(`<!--app-html-->`, appHtml)
  
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
      }else if(req.originalUrl.startsWith('/test2/')){
        const url = req.originalUrl.replace('/test2/', '/')

        let template, render
        if (!isProd) {
          // always read fresh template in dev
          template = fs.readFileSync(resolve('test2/index.html'), 'utf-8')
          template = await viteTest2.transformIndexHtml(url, template)
          render = (await viteTest2.ssrLoadModule('/src/entry-server.js')).render
        } else {
          template = indexProd
          // @ts-ignore
          render = (await import('./dist/server/entry-server.js')).render
        }
  
        const [appHtml, preloadLinks] = await render(url, manifest)
  
        const html = template
          .replace(`<!--preload-links-->`, preloadLinks)
          .replace(`<!--app-html-->`, appHtml)
  
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
      }
     
    } catch (e) {
      viteTest && viteTest.ssrFixStacktrace(e)
      console.log(e.stack)
      res.status(500).end(e.stack)
    }
  })

  return { app }
}

if (!isTest) {
  createServer().then(({ app }) =>
    app.listen(6173, () => {
      console.log('http://localhost:6173')
    })
  )
}

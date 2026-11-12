#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { cpus, availableParallelism, platform, release, totalmem } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scenarioNames = ['finite_plain', 'loop_plain', 'custom_geometry_layout', 'finite_focus', 'finite_parallax']
const optionNames = new Set(['repo', 'output', 'browser', 'counts', 'scenarios', 'warmup',
  'creation-samples', 'operation-samples', 'raf-ms', 'port', 'label'])
const help = `Carousel performance benchmark

Usage:
  npm run benchmark -- [options]
  node scripts/benchmark-performance.mjs [options]

Options accept --name=value or --name value:
  --repo PATH               Checkout to measure (default: this script's repository)
  --output PATH             JSON report (default: performance-results.json in cwd)
  --browser PATH            Chromium executable (default: Playwright's installed Chromium)
  --counts LIST             Positive slide counts (default: 10,100,1000,5000)
  --scenarios LIST          Comma-separated names below (default: all)
  --warmup N                Warmup creations per case (default: 1; zero is allowed)
  --creation-samples N      Measured creations per case (default: 5)
  --operation-samples N     Measured samples per operation (default: 9)
  --raf-ms N                Native rAF observation window in milliseconds (default: 1200)
  --port N                  Local development server port (default: 4183)
  --label TEXT              Label recorded in JSON (default: benchmark)
  --help, -h                Print this help without starting a browser or server

Scenarios:
  ${scenarioNames.join(', ')}

Examples:
  npm run benchmark -- --output ./performance-results.json
  npm run benchmark -- --counts 10 --scenarios finite_plain --creation-samples 1 --operation-samples 1
  npm run benchmark -- --repo ../carousel-baseline --browser /path/to/chromium --output ./baseline.json

Method:
  Each (scenario, count) uses a fresh headless Chromium process with its sandbox enabled.
  Cards contain 19 elements, fixed representative text and no network images.
  Constructor wall time includes internal forced layout; the immediate remaining layout
  flush is measured separately. CDP layout/style durations are also recorded, not added.
  Operation samples run in separate tasks after layout settles. Metadata and cheap finite
  render timings use batches to resolve timer granularity; JSON includes batch sizes.
  Native rAF drives the same plugin drag/render path without adding a render subscriber
  to plain cases. JSON preserves raw samples, median, nearest-rank p95 and long tasks.
  Small-sample p95 is a maximum: a slow case may deliver only a few rAF callbacks in the
  observation window. These are comparative measurements, not a universal slide limit.
  The full default matrix can take several minutes. Avoid concurrent CPU-heavy work.
  Install the project's dependencies and a Playwright Chromium, or pass --browser.
`

function parseOptions(argv) {
  const options = new Map()
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') { options.set('help', true); continue }
    if (!argument.startsWith('--')) throw new TypeError(`Unexpected argument: ${argument}`)
    const equals = argument.indexOf('=')
    const name = argument.slice(2, equals === -1 ? undefined : equals)
    if (!optionNames.has(name)) throw new TypeError(`Unknown option: --${name}`)
    if (options.has(name)) throw new TypeError(`Duplicate option: --${name}`)
    const value = equals === -1 ? argv[++index] : argument.slice(equals + 1)
    if (value === undefined || value.startsWith('--') || value.trim() === '') {
      throw new TypeError(`--${name} requires a value`)
    }
    options.set(name, value)
  }
  return options
}

function integer(value, name, minimum = 1) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < minimum) {
    throw new RangeError(`--${name} must be a safe integer >= ${minimum}`)
  }
  return number
}

function list(value, name) {
  const values = value.split(',').map(value => value.trim())
  if (values.some(value => value === '') || new Set(values).size !== values.length) {
    throw new TypeError(`--${name} must contain a nonempty list of distinct values`)
  }
  return values
}

let args, counts, scenarios, warmup, creationSamples, operationSamples, rafDurationMs, port
try {
  args = parseOptions(process.argv.slice(2))
  if (args.has('help')) { console.log(help); process.exit(0) }
  counts = list(args.get('counts') ?? '10,100,1000,5000', 'counts').map(value => integer(value, 'counts'))
  if (new Set(counts).size !== counts.length) throw new TypeError('--counts must contain distinct counts')
  scenarios = list(args.get('scenarios') ?? scenarioNames.join(','), 'scenarios')
  for (const scenario of scenarios) {
    if (!scenarioNames.includes(scenario)) throw new TypeError(`Unknown scenario: ${scenario}`)
  }
  warmup = integer(args.get('warmup') ?? 1, 'warmup', 0)
  creationSamples = integer(args.get('creation-samples') ?? 5, 'creation-samples')
  operationSamples = integer(args.get('operation-samples') ?? 9, 'operation-samples')
  rafDurationMs = Number(args.get('raf-ms') ?? 1200)
  if (!Number.isFinite(rafDurationMs) || rafDurationMs <= 0) throw new RangeError('--raf-ms must be positive and finite')
  port = integer(args.get('port') ?? 4183, 'port')
  if (port > 65535) throw new RangeError('--port must be between 1 and 65535')
} catch (error) {
  console.error(`Carousel benchmark: ${error.message}\nRun with --help for usage.`)
  process.exit(2)
}

const directory = dirname(fileURLToPath(import.meta.url))
const repository = resolve(args.get('repo') ?? join(directory, '..'))
const output = resolve(args.get('output') ?? 'performance-results.json')
const requireFromRepo = createRequire(join(repository, 'package.json'))
const { chromium } = requireFromRepo('playwright')
const profile = {
  counts, scenarios, warmup, creationSamples, operationSamples, rafDurationMs,
  viewport: { width: 1280, height: 800 },
  carouselWidth: 900, slidesPerView: 3, gap: 12, cardElementCount: 19,
  browserPath: args.has('browser') ? resolve(args.get('browser')) : chromium.executablePath(), chromiumSandbox: true,
  label: args.get('label') ?? 'benchmark',
}
const origin = `http://127.0.0.1:${port}`
const git = (...arguments_) => {
  try { return execFileSync('git', arguments_, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
  catch { return null }
}
for (const file of ['src/index.js', 'scripts/dev-server.mjs', 'styles/carousel.css', 'demo-assets/event-bus/index.js']) {
  if (!(await stat(join(repository, file))).isFile()) throw new TypeError(`Missing benchmark input: ${file}`)
}
await mkdir(dirname(output), { recursive: true })
const document = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="/styles/carousel.css">
<script type="importmap">{"imports":{"@shelamkoff/event-bus":"/demo-assets/event-bus/index.js"}}</script>
<style>body{margin:0;font:14px/1.35 system-ui;background:#fff}.benchmark{margin:20px;width:900px}
.bench-card{box-sizing:border-box;width:100%;height:180px;padding:10px;border:1px solid #ddd;background:#fafafa;overflow:hidden}
.bench-media{height:30px;background:#d7e4ef;display:flex;justify-content:space-between}.bench-body h3{margin:7px 0 3px}
.bench-body p{margin:3px 0}.bench-body ul{display:flex;gap:8px;list-style:none;padding:0;margin:5px 0}
.bench-actions button{font:inherit;border:1px solid #bbb;background:#fff;padding:3px 8px}</style>`
const report = {
  schema: 1, startedAt: new Date().toISOString(), repository, commit: git('rev-parse', 'HEAD'),
  tree: git('rev-parse', 'HEAD^{tree}'),
  dirtyPaths: git('status', '--short'), nodeVersion: process.version, playwrightVersion: requireFromRepo('playwright/package.json').version,
  environment: { platform: platform(), release: release(), cpuModel: cpus()[0]?.model,
    logicalCpus: cpus().length, availableParallelism: availableParallelism(), totalMemoryBytes: totalmem() },
  profile,
  method: {
    timing: 'performance.now wall time; constructorSyncMs includes any layout the library forces internally; firstLayoutFlushMs measures the remaining immediate getBoundingClientRect flush',
    cdpCreation: 'Performance LayoutDuration/RecalcStyleDuration/ScriptDuration deltas cover constructor plus first explicit flush and any browser work before CDP sampling; durations are not additive',
    statistics: 'median and nearest-rank p95; small-sample p95 is a maximum, not a stable population tail estimate',
    isolation: 'fresh Chromium process per (scenario, N); one warmup creation and repeated creations in its page; no parallel benchmarks; no render subscriber in plain cases',
    operationTiming: 'each sample is in a separate task with layout settled before it; default metadata and finite plain render use batches to resolve sub-0.1ms costs; per-op batch means are reported with batch size',
    frameTiming: 'native requestAnimationFrame drives PluginContext.setPositionDrag; synchronous render duration and delivered rAF intervals are observed without a render event subscriber; painting/layout may occur between callbacks',
    limitations: 'headless Chromium on shared cloud CPU is a comparative sample, not a hardware-independent slide-count limit or a physical display frame-rate promise',
  },
  cases: [],
}

const server = spawn(process.execPath, ['scripts/dev-server.mjs'], {
  cwd: repository, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'],
})
let serverError = ''
server.stderr.on('data', data => { serverError += data.toString() })
const serverReady = new Promise((ready, reject) => {
  let startupOutput = ''
  const timeout = setTimeout(() => reject(new Error('Development server did not start within 10 seconds')), 10000)
  const complete = callback => value => { clearTimeout(timeout); callback(value) }
  server.once('error', complete(reject))
  server.once('exit', complete(code => reject(new Error(`Development server exited (${code}): ${serverError}`))))
  server.stdout.on('data', data => {
    startupOutput += data.toString()
    if (startupOutput.includes(`Carousel demo: ${origin}/`)) complete(ready)()
  })
})
let browser
try {
  await serverReady
  for (const resource of ['/src/index.js', '/styles/carousel.css', '/demo-assets/event-bus/index.js']) {
    const response = await fetch(origin + resource, { signal: AbortSignal.timeout(5000) })
    if (!response.ok || !(await response.text()).trim()) {
      throw new Error(`Development server could not serve ${resource} (${response.status})`)
    }
  }
  for (const count of profile.counts) {
    for (const scenario of profile.scenarios) {
      const caseStart = performance.now()
      console.log(JSON.stringify({ phase: 'start', scenario, count, time: new Date().toISOString() }))
      browser = await chromium.launch({ executablePath: profile.browserPath, chromiumSandbox: true, headless: true })
      report.browserVersion ??= browser.version()
      const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: 1, reducedMotion: 'no-preference' })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
      await page.route('**/__carousel_benchmark__', route => route.fulfill({ contentType: 'text/html', body: document }))
      await page.goto(`${origin}/__carousel_benchmark__`)
      await page.evaluate(async ({ count, scenario, profile }) => {
        const api = await import('/src/index.js')
        const task = () => new Promise(resolve => setTimeout(resolve, 0))
        const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))
        const stats = samples => {
          const sorted = [...samples].sort((a, b) => a - b)
          const middle = Math.floor(sorted.length / 2)
          return { n: samples.length, median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
            p95: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)], min: sorted[0], max: sorted.at(-1), samples }
        }
        const markup = (index, version = 0) => `<article class="bench-card"><div class="bench-media"><span>Item ${index}</span><span>New</span></div><div class="bench-body"><h3>Card ${index}</h3><p><span>Representative content </span><strong>${version}</strong></p><ul><li><span>One</span></li><li><span>Two</span></li><li><span>Three</span></li></ul><div class="bench-actions"><button type="button"><span>Details</span></button></div></div></article>`
        const original = Array.from({ length: count }, (_, index) => ({
          id: `slide-${index}`, content: markup(index), meta: { width: 210 + index % 3 * 50, version: 0 },
        }))
        let carousel, host, pluginContext
        let metadataVersion = 0, frameSerial = 0
        const hookErrors = []
        const custom = scenario === 'custom_geometry_layout'
        const options = () => ({
          slidesPerView: profile.slidesPerView, gap: profile.gap, transitionDuration: 0,
          loop: scenario === 'loop_plain',
          ...(custom ? {
            geometry: { name: 'variable widths', measure({ slides, gap }) {
              let offset = 0
              return { slides: slides.map(({ meta }) => {
                const measurement = { offset, size: meta.width }
                offset += meta.width + gap
                return measurement
              }) }
            } },
            layout: { name: 'subtle focus size', render({ slides }) {
              return slides.map(slide => ({ offset: slide.offset,
                size: slide.size * (.96 + .04 * Math.max(0, 1 - Math.abs(slide.progress))), progress: slide.progress }))
            } },
          } : {}),
          plugins: [
            { name: 'benchmark capture', install(context) {
              pluginContext = context
              for (const type of ['slide:error', 'effect:error', 'layout:error', 'geometry:error']) {
                context.on(type, ({ error }) => hookErrors.push({ type, message: error?.message }))
              }
            }, destroy() { pluginContext = null } },
            ...(scenario === 'finite_focus' ? [api.createFocusEffect({ scale: .92, opacity: .65, offset: 8 })] : []),
            ...(scenario === 'finite_parallax' ? [api.createParallax({ factor: .2 })] : []),
          ],
        })
        const flush = () => host.getBoundingClientRect().height
        const longTasks = []
        let observer = null
        if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
          observer = new PerformanceObserver(list => {
            longTasks.push(...list.getEntries().map(entry => ({ startTime: entry.startTime, duration: entry.duration })))
          })
          observer.observe({ type: 'longtask', buffered: false })
        }
        window.benchmark = {
          stats,
          runtime: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
            crossOriginIsolated, longTaskSupported: !!observer, devicePixelRatio, hookErrors },
          async destroy() {
            if (carousel) { carousel.destroy(); carousel = null }
            host?.remove(); host = null
            await task(); await nextFrame()
          },
          async prepare() {
            await this.destroy()
            host = document.createElement('div'); host.className = 'benchmark'; host.style.width = `${profile.carouselWidth}px`
            document.body.appendChild(host)
            flush(); await task()
          },
          create() {
            const start = performance.now()
            carousel = new api.Carousel(host, original, options())
            const constructed = performance.now()
            const height = flush()
            const end = performance.now()
            return { constructorSyncMs: constructed - start, firstLayoutFlushMs: end - constructed,
              constructorAndFlushMs: end - start, height }
          },
          async settle() { await task(); await nextFrame(); await nextFrame(); flush() },
          inventory() {
            const walker = document.createTreeWalker(host, NodeFilter.SHOW_ALL)
            let nodes = 0
            while (walker.nextNode()) nodes++
            const html = host.innerHTML
            return { descendantElements: host.querySelectorAll('*').length, descendantNodes: nodes,
              markupUtf8Bytes: new TextEncoder().encode(html).length,
              originalWrappers: host.querySelectorAll('.carousel__slide:not([data-carousel-copy])').length,
              copyWrappers: host.querySelectorAll('[data-carousel-copy]').length }
          },
          async operations() {
            const middle = Math.floor(count / 2)
            const replacements = Array.from({ length: profile.operationSamples + 1 }, (_, version) => markup(middle, version + 1))
            const measure = async (operation, batchSize = 1, explicitFlush = false) => {
              const samples = [], flushSamples = []
              for (let sample = -1; sample < profile.operationSamples; sample++) {
                await task(); flush()
                const start = performance.now()
                for (let repetition = 0; repetition < batchSize; repetition++) operation(sample + 1, repetition)
                const end = performance.now()
                let flushMs = 0
                if (explicitFlush) { flush(); flushMs = performance.now() - end }
                if (sample >= 0) { samples.push((end - start) / batchSize); flushSamples.push(flushMs) }
              }
              return { batchSize, perOperationMs: stats(samples), ...(explicitFlush ? { remainingLayoutFlushMs: stats(flushSamples) } : {}) }
            }
            const metadata = await measure(() => carousel.updateSlide(middle, {
              meta: { ...carousel.getSlide(middle).meta, version: ++metadataVersion },
            }), custom ? 1 : 256, true)
            const content = await measure(sample => carousel.updateSlide(middle, { content: replacements[sample] }), 1, true)
            const reverse = await measure(() => carousel.setSlides(carousel.getSlides().reverse()), 1, true)
            const advance = await measure(() => {
              if (carousel.getIndex() >= carousel.getNavigationGeometry().lastIndex) carousel.prev()
              else carousel.next()
            })
            const frameBatch = scenario === 'finite_plain' ? 256 : Math.min(64, Math.max(1, Math.floor(1000 / count)) * 4)
            const render = await measure(() => {
              const geometry = carousel.getNavigationGeometry()
              const distance = Math.min(geometry.maxPosition, geometry.viewportSize * 2)
              pluginContext.setPositionDrag(distance * (frameSerial++ % 61) / 60)
            }, frameBatch)
            return { metadata, content, reverse, advance, render }
          },
          async animate() {
            await this.settle()
            const geometry = carousel.getNavigationGeometry()
            const distance = Math.min(geometry.maxPosition, geometry.viewportSize * 2)
            const timestamps = [], sync = []
            let start, end
            await new Promise(resolve => {
              const tick = timestamp => {
                start ??= performance.now()
                const elapsed = performance.now() - start
                timestamps.push(timestamp)
                const before = performance.now()
                const progress = .5 - .5 * Math.cos(elapsed / profile.rafDurationMs * Math.PI * 4)
                pluginContext.setPositionDrag(distance * progress)
                sync.push(performance.now() - before)
                if (elapsed < profile.rafDurationMs) requestAnimationFrame(tick)
                else { end = performance.now(); resolve() }
              }
              requestAnimationFrame(tick)
            })
            await task(); await task()
            const intervals = timestamps.slice(1).map((value, index) => value - timestamps[index])
            const tasks = longTasks.filter(entry => entry.startTime < end && entry.startTime + entry.duration > start)
            return { elapsedMs: end - start, frames: sync.length, approximateFps: intervals.length * 1000 / (timestamps.at(-1) - timestamps[0]),
              syncRenderMs: stats(sync), rafIntervalMs: stats(intervals),
              intervalsOver25Ms: intervals.filter(value => value > 25).length,
              intervalsOver50Ms: intervals.filter(value => value > 50).length,
              longTasks: tasks, longTaskDurationMs: tasks.reduce((sum, task) => sum + task.duration, 0) }
          },
        }
      }, { count, scenario, profile })
      const session = await context.newCDPSession(page)
      await session.send('Performance.enable')
      const metrics = async () => Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]))
      for (let warmup = 0; warmup < profile.warmup; warmup++) {
        await page.evaluate(() => window.benchmark.prepare())
        await page.evaluate(() => window.benchmark.create())
        await page.evaluate(() => window.benchmark.settle())
      }
      const creations = []
      for (let repetition = 0; repetition < profile.creationSamples; repetition++) {
        await page.evaluate(() => window.benchmark.prepare())
        const before = await metrics()
        const creation = await page.evaluate(() => window.benchmark.create())
        const after = await metrics()
        creation.cdp = Object.fromEntries(['LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration', 'LayoutCount', 'RecalcStyleCount']
          .map(name => [name, (after[name] ?? 0) - (before[name] ?? 0)]))
        creations.push(creation)
        await page.evaluate(() => window.benchmark.settle())
      }
      const inventory = await page.evaluate(() => window.benchmark.inventory())
      const operations = await page.evaluate(() => window.benchmark.operations())
      const animation = await page.evaluate(() => window.benchmark.animate())
      const runtime = await page.evaluate(() => window.benchmark.runtime)
      const creation = await page.evaluate(samples => Object.fromEntries(
        ['constructorSyncMs', 'firstLayoutFlushMs', 'constructorAndFlushMs'].map(name => [name, window.benchmark.stats(samples.map(sample => sample[name]))])), creations)
      const result = { scenario, count, runtime, creation, creations, inventory, operations, animation, errors,
        elapsedSeconds: (performance.now() - caseStart) / 1000 }
      report.cases.push(result)
      await writeFile(output, JSON.stringify(report, null, 2) + '\n')
      console.log(JSON.stringify({ phase: 'complete', scenario, count, seconds: result.elapsedSeconds,
        constructorMs: creation.constructorSyncMs.median, reverseMs: operations.reverse.perOperationMs.median,
        renderMs: animation.syncRenderMs.median, rafP95Ms: animation.rafIntervalMs.p95, errors }))
      await browser.close(); browser = null
    }
  }
  report.finishedAt = new Date().toISOString()
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ phase: 'finished', output, cases: report.cases.length }))
} catch (error) {
  report.error = { message: error.message, stack: error.stack }
  report.finishedAt = new Date().toISOString()
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  throw error
} finally {
  try { await browser?.close() }
  finally { server.kill('SIGTERM') }
}

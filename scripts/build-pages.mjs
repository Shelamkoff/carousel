import { appendFile, cp, lstat, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Stage only public demo assets. Tests, package metadata, repository files and
// development dependencies never enter the Pages artifact.
const root = new URL('../', import.meta.url)
const destination = await mkdtemp(join(tmpdir(), 'carousel-pages-'))

async function copyDirectory(name, accepts) {
  await cp(new URL(`${name}/`, root), join(destination, name), {
    recursive: true,
    filter: async source => {
      const entry = await lstat(source)
      if (entry.isSymbolicLink()) throw new Error(`Pages assets must not be symbolic links: ${source}`)
      return entry.isDirectory() || (entry.isFile() && accepts(source))
    },
  })
}

await cp(new URL('index.html', root), join(destination, 'index.html'))
await copyDirectory('src', path => path.endsWith('.js'))
await copyDirectory('styles', path => path.endsWith('.css'))
await copyDirectory('demo-assets', () => true)
await cp(new URL('LICENSE', root), join(destination, 'LICENSE'))
await writeFile(join(destination, '.nojekyll'), '')

// This endpoint lets deployment checks distinguish an updated site from a stale
// CDN response without adding build information to the demo interface.
const revision = /^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? '') ? process.env.GITHUB_SHA : null
await writeFile(join(destination, 'version.json'), `${JSON.stringify({ revision })}\n`)

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `path=${destination}\n`)
}
console.log(`Static demo: ${destination}`)

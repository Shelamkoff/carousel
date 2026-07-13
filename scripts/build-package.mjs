import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'

const dist = new URL('../dist/', import.meta.url)
await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
await cp(new URL('../src/', import.meta.url), new URL('src/', dist), { recursive: true })
await cp(new URL('../styles/', import.meta.url), new URL('styles/', dist), { recursive: true })

async function rewriteLocalDependencies(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    if (entry.isDirectory()) await rewriteLocalDependencies(url)
    else if (entry.name.endsWith('.js')) {
      const source = await readFile(url, 'utf8')
      await writeFile(url, source.replaceAll("../../event-bus/index.js", "@shelamkoff/event-bus"))
    }
  }
}
await rewriteLocalDependencies(new URL('src/', dist))

import { cp, mkdir, rm } from 'node:fs/promises'

// Commit this small dependency beside the demo so GitHub Pages and browser
// checks use the same locked module without a third-party CDN at runtime.
const packageUrl = new URL(import.meta.resolve('@shelamkoff/event-bus/package.json'))
const destination = new URL('../demo-assets/event-bus/', import.meta.url)
await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })
await cp(new URL('dist/', packageUrl), destination, { recursive: true })
await cp(new URL('LICENSE', packageUrl), new URL('LICENSE', destination))

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('demo server rejects missing, private and escaping paths without stopping', async t => {
  const child = spawn(process.execPath, ['scripts/dev-server.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let errors = ''
  child.stderr.on('data', data => { errors += data })
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = once(child, 'exit')
      child.kill('SIGTERM')
      await exited
    }
    assert.equal(errors, '')
  })
  const [output] = await once(child.stdout, 'data')
  const origin = String(output).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
  assert.ok(origin, 'the server reports its assigned port')

  for (const path of ['/styles/', '/%ZZ', '/.git/config', '/%2e%2e%2fpackage.json']) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 404, path)
    await response.text()
  }

  const outside = await mkdtemp(join(tmpdir(), 'carousel-server-'))
  const link = new URL(`../server-fixture-${process.pid}.txt`, import.meta.url)
  t.after(async () => {
    await rm(link, { force: true })
    await rm(outside, { recursive: true, force: true })
  })
  const target = join(outside, 'outside.txt')
  await writeFile(target, 'outside the demo root')
  await symlink(target, link)
  const escaped = await fetch(`${origin}/server-fixture-${process.pid}.txt`)
  assert.equal(escaped.status, 404)
  await escaped.text()

  const head = await fetch(origin + '/styles/carousel.css', { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.match(head.headers.get('content-type'), /^text\/css/)
  assert.equal(await head.text(), '')
  const page = await fetch(origin)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /carousel/i)
  assert.equal(child.exitCode, null)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { waitForBranchPages } from '../scripts/wait-for-branch-pages.mjs'

const sha = 'a'.repeat(40)
const newer = 'b'.repeat(40)
const legacy = (status, overrides = {}) => ({
  id: 10, path: 'dynamic/pages/pages-build-deployment', head_sha: sha, head_branch: 'master', status, ...overrides,
})

function fixture(runLists, heads = [sha]) {
  const sleeps = []
  const requests = []
  let time = 0, runReads = 0, headReads = 0
  return {
    sleeps, requests,
    options: {
      repository: 'Shelamkoff/carousel', sha, runId: '99', token: 'test-token', timeoutMs: 20, pollMs: 5,
      now: () => time, sleep: async ms => { sleeps.push(ms); time += ms }, log() {},
      fetchImpl: async (url, options) => {
        requests.push(url)
        assert.equal(options.redirect, 'error')
        assert.ok(options.signal instanceof AbortSignal)
        if (url.endsWith('/git/ref/heads/master')) {
          return Response.json({ object: { sha: heads[Math.min(headReads++, heads.length - 1)] } })
        }
        assert.ok(url.endsWith(`/actions/runs?head_sha=${sha}&per_page=100`))
        return Response.json({ workflow_runs: runLists[Math.min(runReads++, runLists.length - 1)] })
      },
    },
  }
}

test('Pages deployment waits through queued and running branch jobs before allowing its artifact', async () => {
  const state = fixture([[legacy('queued')], [legacy('in_progress')], [legacy('completed')]])
  assert.equal(await waitForBranchPages(state.options), true)
  assert.deepEqual(state.sleeps, [5, 5])
  assert.equal(state.requests.filter(url => url.includes('/actions/runs?')).length, 3)
  assert.ok(state.requests.at(-1).endsWith('/git/ref/heads/master'), 'master is rechecked immediately before approval')
})

test('Pages deployment ignores unrelated heads, branches, custom workflows and its own run', async () => {
  const state = fixture([[
    legacy('in_progress', { head_sha: newer }), legacy('in_progress', { head_branch: 'main' }),
    legacy('in_progress', { path: '.github/workflows/pages.yml' }), legacy('in_progress', { id: 99 }),
    legacy('completed', { conclusion: 'failure' }),
  ]])
  assert.equal(await waitForBranchPages(state.options), true, 'completed failed legacy builds cannot overwrite later')
  assert.deepEqual(state.sleeps, [])
})

test('Pages deployment waits for all matching branch runs, including reruns', async () => {
  const completed = legacy('completed')
  const state = fixture([
    [completed, legacy('in_progress', { id: 11 })],
    [completed, legacy('completed', { id: 11, conclusion: 'cancelled' })],
  ])
  assert.equal(await waitForBranchPages(state.options), true)
  assert.deepEqual(state.sleeps, [5])
})

test('Pages deployment skips a stale head before polling and after the last run lookup', async () => {
  for (const heads of [[newer], [sha, newer]]) {
    const state = fixture([[legacy('completed')]], heads)
    assert.equal(await waitForBranchPages(state.options), false)
    assert.deepEqual(state.sleeps, [])
    assert.equal(state.requests.length, heads.length === 1 ? 1 : 3)
  }
})

test('Pages deployment fails clearly when the expected branch workflow never appears or finishes', async () => {
  for (const [runs, message] of [[[], /appear/], [[legacy('in_progress')], /complete/]]) {
    const state = fixture([runs])
    await assert.rejects(waitForBranchPages(state.options), message)
    assert.equal(state.sleeps.reduce((sum, value) => sum + value, 0), 20)
  }
})

test('Pages deployment fails closed on API errors and malformed responses', async () => {
  for (const [fetchImpl, message] of [
    [async () => new Response('', { status: 403 }), /HTTP 403/],
    [async () => Response.json({}), /invalid master reference/],
    [async () => { throw new Error('network unavailable') }, /network unavailable/],
  ]) {
    const state = fixture([[legacy('completed')]])
    await assert.rejects(waitForBranchPages({ ...state.options, fetchImpl }), message)
    assert.deepEqual(state.sleeps, [])
  }
  const state = fixture([[legacy('completed')]])
  await assert.rejects(waitForBranchPages({ ...state.options,
    fetchImpl: async url => url.includes('/actions/runs?') ? Response.json({}) : state.options.fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(1000) }),
  }), /invalid Actions run list/)
})

test('Pages deployment validates runtime metadata before sending the token', async () => {
  const state = fixture([[legacy('completed')]])
  for (const override of [
    { repository: '../carousel' }, { repository: 'owner/..' }, { sha: 'main' }, { runId: 'nan' },
    { token: '' }, { apiUrl: 'https://example.invalid' }, { timeoutMs: 0 },
  ]) {
    await assert.rejects(waitForBranchPages({ ...state.options, ...override }))
  }
  assert.deepEqual(state.requests, [])
})

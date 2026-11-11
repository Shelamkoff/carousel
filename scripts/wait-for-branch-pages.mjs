import { appendFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const LEGACY_PAGES_PATH = 'dynamic/pages/pages-build-deployment'
const SHA = /^[0-9a-f]{40}$/

// Branch Pages is still enabled in repository settings. Its automatic workflow
// must finish before our explicit artifact deployment can safely publish last.
export async function waitForBranchPages({
  repository, sha, runId, token, apiUrl = 'https://api.github.com',
  timeoutMs = 300_000, pollMs = 5_000, fetchImpl = fetch,
  now = () => performance.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  log = console.log,
}) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')
    || repository.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('GITHUB_REPOSITORY must be an owner/repository pair')
  }
  if (!SHA.test(sha ?? '')) throw new Error('GITHUB_SHA must be a full commit SHA')
  if (!/^[1-9][0-9]*$/.test(String(runId ?? ''))) throw new Error('GITHUB_RUN_ID must be a positive integer')
  if (typeof token !== 'string' || !token.trim()) throw new Error('GITHUB_TOKEN is required')
  if (apiUrl.replace(/\/$/, '') !== 'https://api.github.com') throw new Error('Unexpected GITHUB_API_URL')
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(pollMs) || pollMs <= 0) {
    throw new Error('Pages polling durations must be positive finite numbers')
  }
  const base = `https://api.github.com/repos/${repository.split('/').map(encodeURIComponent).join('/')}`
  const deadline = now() + timeoutMs
  let observed = false
  const timedOut = () => new Error(`Timed out waiting for branch Pages to ${observed ? 'complete' : 'appear'} for ${sha}`)

  async function request(path) {
    const remaining = deadline - now()
    if (remaining <= 0) throw timedOut()
    const response = await fetchImpl(base + path, {
      headers: {
        Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(Math.max(1, Math.min(10_000, Math.ceil(remaining)))),
      redirect: 'error',
    })
    if (!response.ok) throw new Error(`GitHub Pages gate request failed: HTTP ${response.status}`)
    return response.json()
  }

  async function stillCurrent() {
    const ref = await request('/git/ref/heads/master')
    if (!SHA.test(ref?.object?.sha ?? '')) throw new Error('GitHub returned an invalid master reference')
    if (ref.object.sha === sha) return true
    log('Skipping deployment because master now points to a newer commit.')
    return false
  }

  while (now() < deadline) {
    if (!await stillCurrent()) return false
    const result = await request(`/actions/runs?head_sha=${sha}&per_page=100`)
    if (!Array.isArray(result?.workflow_runs)) throw new Error('GitHub returned an invalid Actions run list')
    const branchRuns = result.workflow_runs.filter(run => run.path === LEGACY_PAGES_PATH
      && run.head_sha === sha && run.head_branch === 'master' && String(run.id) !== String(runId))
    observed ||= branchRuns.length > 0
    if (branchRuns.length > 0 && branchRuns.every(run => run.status === 'completed')) {
      // Check again after reading runs: a newer push can arrive while waiting.
      if (!await stillCurrent()) return false
      log(`Branch Pages finished (${branchRuns.length} run(s)); the current demo artifact can deploy.`)
      return true
    }
    const remaining = deadline - now()
    if (remaining <= 0) break
    await sleep(Math.min(pollMs, remaining))
  }
  throw timedOut()
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required')
    const shouldDeploy = await waitForBranchPages({
      repository: process.env.GITHUB_REPOSITORY, sha: process.env.GITHUB_SHA,
      runId: process.env.GITHUB_RUN_ID, token: process.env.GITHUB_TOKEN,
      apiUrl: process.env.GITHUB_API_URL,
    })
    await appendFile(process.env.GITHUB_OUTPUT, `should_deploy=${shouldDeploy}\n`)
  } catch (error) {
    console.error(`Pages deployment gate: ${error.message}`)
    process.exitCode = 1
  }
}

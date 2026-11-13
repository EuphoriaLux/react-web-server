import React, { useEffect, useState } from 'react'

const KEYS = [
  'cp-custody', 'cp-locked', 'cp-lockdays', 'cp-events', 'cp-expenses',
  'cp-swaps', 'cp-issues', 'cp-docs', 'cp-messages', 'cp-handovers',
]
const TOKEN_KEY = 'cp-token'
const CODE_KEY = 'cp-code'
const ROLE_KEY = 'cp-role'

function sameState(a, b) {
  const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].sort()
  return keys.every((key) => (a || {})[key] === (b || {})[key])
}

function snapshot() {
  const state = {}
  for (const key of KEYS) {
    const raw = localStorage.getItem(key)
    if (raw != null) state[key] = raw
  }
  return state
}

function applyState(state) {
  for (const key of KEYS) {
    if (state[key] == null) localStorage.removeItem(key)
    else localStorage.setItem(key, state[key])
  }
}

async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(path, { ...options, headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`)
  return body
}

export function ShareBar() {
  const [code, setCode] = useState(() => localStorage.getItem(CODE_KEY) || '')
  const [role, setRole] = useState(() => localStorage.getItem(ROLE_KEY) || '')
  const [join, setJoin] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return undefined
    let stopped = false
    let lastSent = ''

    async function pull() {
      try {
        const remote = await api('/api/state')
        if (stopped) return
        const remoteState = remote.state || {}
        const localState = snapshot()
        if (!sameState(remoteState, localState) && Object.keys(remoteState).length > 0) {
          const stamp = remote.updated_at || 'remote'
          if (sessionStorage.getItem('cp-sync-stamp') === stamp) {
            setStatus('Shared plan is open')
            return
          }
          sessionStorage.setItem('cp-sync-stamp', stamp)
          applyState(remoteState)
          if (remote.role) {
            localStorage.setItem(ROLE_KEY, remote.role)
            localStorage.setItem('cp-writer', remote.role)
          }
          window.location.reload()
          return
        }
        sessionStorage.removeItem('cp-sync-stamp')
        const local = JSON.stringify(localState)
        if (local !== lastSent && !sameState(remoteState, localState)) {
          await api('/api/state', { method: 'PUT', body: JSON.stringify({ state: localState }) })
          lastSent = local
          if (!stopped) setStatus('Saved')
        } else if (!stopped) {
          setStatus('Shared plan is open')
        }
      } catch (error) {
        if (!stopped) setStatus(error.message)
      }
    }

    pull()
    const timer = setInterval(pull, 8000)
    return () => { stopped = true; clearInterval(timer) }
  }, [code])

  async function create() {
    setBusy(true)
    setStatus('')
    try {
      const created = await api('/api/households', { method: 'POST', body: '{}' })
      localStorage.setItem(TOKEN_KEY, created.token)
      localStorage.setItem(CODE_KEY, created.code)
      localStorage.setItem(ROLE_KEY, created.role)
      localStorage.setItem('cp-writer', created.role)
      setCode(created.code)
      setRole(created.role)
      await api('/api/state', { method: 'PUT', body: JSON.stringify({ state: snapshot() }) })
      setStatus('Plan created. Send the code to the other parent.')
    } catch (error) {
      setStatus(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function joinPlan(event) {
    event.preventDefault()
    setBusy(true)
    setStatus('')
    try {
      const joined = await api('/api/households/join', {
        method: 'POST',
        body: JSON.stringify({ code: join.trim().toUpperCase() }),
      })
      localStorage.setItem(TOKEN_KEY, joined.token)
      localStorage.setItem(CODE_KEY, joined.code)
      localStorage.setItem(ROLE_KEY, joined.role)
      localStorage.setItem('cp-writer', joined.role)
      setCode(joined.code)
      setRole(joined.role)
      setStatus('Joined. Loading the shared plan.')
    } catch (error) {
      setStatus(error.message)
    } finally {
      setBusy(false)
    }
  }

  function copy() {
    navigator.clipboard?.writeText(code)
    setStatus('Code copied')
  }

  function leave() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(CODE_KEY)
    localStorage.removeItem(ROLE_KEY)
    setCode('')
    setRole('')
    setStatus('Left this shared plan on this phone. The plan is still on the server.')
  }

  if (!code) {
    return (
      <div className="share-bar">
        <div>
          <strong>Share this plan</strong>
          <p>One code for both parents. No account.</p>
        </div>
        <button className="btn primary sm" type="button" onClick={create} disabled={busy}>Create shared plan</button>
        <form onSubmit={joinPlan}>
          <input value={join} onChange={(event) => setJoin(event.target.value)} placeholder="Enter code" maxLength={6} />
          <button className="btn ghost sm" type="submit" disabled={busy || join.trim().length < 6}>Join</button>
        </form>
        {status && <p className="lock-hint">{status}</p>}
      </div>
    )
  }

  return (
    <div className="share-bar on">
      <div>
        <strong>Shared plan {code}</strong>
        <p>You are {role === 'A' ? 'Alex' : 'Sam'}. The other parent joins with this code.</p>
      </div>
      <button className="btn ghost sm" type="button" onClick={copy}>Copy code</button>
      <button className="btn ghost sm" type="button" onClick={leave}>Leave on this phone</button>
      {status && <p className="lock-hint">{status}</p>}
    </div>
  )
}

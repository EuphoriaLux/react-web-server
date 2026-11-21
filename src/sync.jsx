import React, { useEffect, useState } from 'react'

const KEYS = [
  'cp-custody', 'cp-locked', 'cp-lockdays', 'cp-events', 'cp-expenses',
  'cp-swaps', 'cp-issues', 'cp-docs', 'cp-messages', 'cp-handovers', 'cp-rules', 'cp-profile', 'cp-activity',
]
const TOKEN_KEY = 'cp-token'
const CODE_KEY = 'cp-code'
const ROLE_KEY = 'cp-role'
const EMAIL_KEY = 'cp-email'
const STAMP_KEY = 'cp-sync-stamp'
const BASE_KEY = 'cp-sync-base'

export const SYNC_KEYS = KEYS

export function sameState(a, b) {
  const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].sort()
  return keys.every((key) => (a || {})[key] === (b || {})[key])
}

export function mergeStates(base, local, remote) {
  const merged = {}
  let changedLocal = false
  for (const key of KEYS) {
    const baseVal = base ? base[key] : undefined
    const localVal = local ? local[key] : undefined
    const remoteVal = remote ? remote[key] : undefined
    const localChanged = localVal !== baseVal
    const remoteChanged = remoteVal !== baseVal
    let chosen
    if (localChanged && !remoteChanged) {
      chosen = localVal
    } else if (remoteChanged) {
      chosen = remoteVal
    } else {
      chosen = localVal
    }
    if (chosen != null) merged[key] = chosen
    if (chosen !== localVal) changedLocal = true
  }
  return { merged, changedLocal }
}

function readBase() {
  try {
    const raw = sessionStorage.getItem(BASE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeBase(state, stamp) {
  sessionStorage.setItem(BASE_KEY, JSON.stringify(state || {}))
  if (stamp) sessionStorage.setItem(STAMP_KEY, stamp)
  else sessionStorage.removeItem(STAMP_KEY)
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
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`)
    error.status = response.status
    throw error
  }
  return body
}

// Asked once per page load, so a sign-in link is never spent twice.
let whoPromise = null
function whoAmI() {
  if (!whoPromise) whoPromise = askWho()
  return whoPromise
}

async function askWho() {
  const params = new URLSearchParams(window.location.search)
  const login = params.get('login')
  if (!login) return api('/api/me')
  params.delete('login')
  const rest = params.toString()
  window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash)
  try {
    return await api('/api/auth/verify', { method: 'POST', body: JSON.stringify({ token: login }) })
  } catch (error) {
    // The link was used already, for example in another tab. Fall back to the session.
    error.fromLink = true
    return api('/api/me').catch(() => { throw error })
  }
}

export function ShareBar({ onSync }) {
  const [code, setCode] = useState(() => localStorage.getItem(CODE_KEY) || '')
  const [role, setRole] = useState(() => localStorage.getItem(ROLE_KEY) || '')
  // undefined while we ask the server, null when signed out
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY) || undefined)
  const [address, setAddress] = useState('')
  const [sent, setSent] = useState('')
  const [join, setJoin] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!code) return undefined
    let stopped = false
    let syncing = false
    let pushTimer = null

    async function syncNow() {
      if (stopped || syncing) return
      syncing = true
      try {
        const remote = await api('/api/state')
        if (stopped) return
        const remoteState = remote.state || {}
        const remoteStamp = remote.updated_at || ''
        const localState = snapshot()
        const baseState = readBase()
        const lastStamp = sessionStorage.getItem(STAMP_KEY) || ''
        const remoteHasData = Object.keys(remoteState).length > 0

        if (remote.role) {
          localStorage.setItem(ROLE_KEY, remote.role)
          setRole(remote.role)
        }

        // First sync after joining or opening a session with existing remote data
        if (!baseState && !lastStamp) {
          if (remoteHasData) {
            const changed = !sameState(remoteState, localState)
            applyState(remoteState)
            if (remote.role) localStorage.setItem('cp-writer', remote.role)
            writeBase(remoteState, remoteStamp)
            if (changed && onSync) onSync()
            if (!stopped) setStatus('Shared plan is open')
            return
          }
          // Remote is empty: push local snapshot if non-empty
          if (Object.keys(localState).length > 0) {
            const saved = await api('/api/state', { method: 'PUT', body: JSON.stringify({ state: localState }) })
            writeBase(localState, saved.updated_at || remoteStamp)
            if (!stopped) setStatus('Saved')
            return
          }
          writeBase(remoteState, remoteStamp)
          if (!stopped) setStatus('Shared plan is open')
          return
        }

        const effectiveBase = baseState || {}
        const localChanged = !sameState(localState, effectiveBase)
        const remoteChanged = Boolean(remoteStamp && remoteStamp !== lastStamp) || !sameState(remoteState, effectiveBase)

        if (!localChanged && !remoteChanged) {
          if (remoteStamp && remoteStamp !== lastStamp) writeBase(effectiveBase, remoteStamp)
          if (!stopped) setStatus('Shared plan is open')
          return
        }

        if (localChanged && !remoteChanged) {
          const saved = await api('/api/state', { method: 'PUT', body: JSON.stringify({ state: localState }) })
          writeBase(localState, saved.updated_at || remoteStamp)
          if (!stopped) setStatus('Saved')
          return
        }

        if (!localChanged && remoteChanged) {
          applyState(remoteState)
          writeBase(remoteState, remoteStamp)
          if (onSync) onSync()
          if (!stopped) setStatus('Updated from shared plan')
          return
        }

        // Both sides changed: merge per-key so edits on different tabs don't clobber each other
        const { merged, changedLocal } = mergeStates(effectiveBase, localState, remoteState)
        if (changedLocal) applyState(merged)
        if (!sameState(merged, remoteState)) {
          const saved = await api('/api/state', { method: 'PUT', body: JSON.stringify({ state: merged }) })
          writeBase(merged, saved.updated_at || remoteStamp)
          if (!stopped) setStatus('Saved')
        } else {
          writeBase(merged, remoteStamp)
          if (!stopped) setStatus('Updated from shared plan')
        }
        if (changedLocal && onSync) onSync()
      } catch (error) {
        if (!stopped) setStatus(error.message)
      } finally {
        syncing = false
      }
    }

    function schedulePush() {
      if (stopped) return
      clearTimeout(pushTimer)
      pushTimer = setTimeout(syncNow, 700)
    }

    syncNow()
    const timer = setInterval(syncNow, 8000)
    window.addEventListener('cp-local-change', schedulePush)
    return () => {
      stopped = true
      clearInterval(timer)
      clearTimeout(pushTimer)
      window.removeEventListener('cp-local-change', schedulePush)
    }
  }, [code, onSync])

  function openPlan(household) {
    if (household) {
      localStorage.setItem(CODE_KEY, household.code)
      localStorage.setItem(ROLE_KEY, household.role)
      localStorage.setItem('cp-writer', household.role)
      setCode(household.code)
      setRole(household.role)
    } else if (!localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(CODE_KEY)
      localStorage.removeItem(ROLE_KEY)
      setCode('')
      setRole('')
    }
  }

  // Who is signed in. Also finishes a sign-in link and moves a plan made
  // before accounts onto the account.
  useEffect(() => {
    let stopped = false
    async function start() {
      let me
      try {
        me = await whoAmI()
      } catch (error) {
        if (stopped) return
        if (error.fromLink) setStatus(error.message)
        // Offline or a server hiccup is not a sign-out: keep what this phone knows.
        if (error.status !== 401 && !error.fromLink) return
        localStorage.removeItem(EMAIL_KEY)
        setEmail(null)
        openPlan(null)
        return
      }
      const legacy = localStorage.getItem(TOKEN_KEY)
      if (legacy) {
        if (!me.household) {
          try {
            me.household = await api('/api/households/claim', { method: 'POST', body: JSON.stringify({ token: legacy }) })
          } catch {
            // Not claimable: the plan stays reachable with the old token until it is.
          }
        }
        if (me.household) localStorage.removeItem(TOKEN_KEY)
      }
      if (stopped) return
      localStorage.setItem(EMAIL_KEY, me.email)
      setEmail(me.email)
      openPlan(me.household)
    }
    start()
    return () => { stopped = true }
  }, [])

  async function requestLink(event) {
    event.preventDefault()
    setBusy(true)
    setStatus('')
    try {
      const to = address.trim()
      // A plan made before accounts travels with the link, so it is still claimed
      // when the link opens on another site address than this one.
      const legacy = localStorage.getItem(TOKEN_KEY) || undefined
      await api('/api/auth/request', { method: 'POST', body: JSON.stringify({ email: to, legacy }) })
      setSent(to)
    } catch (error) {
      setStatus(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setBusy(true)
    try {
      await api('/api/auth/logout', { method: 'POST', body: '{}' })
    } catch {
      // Signing out on this phone still happens below.
    }
    whoPromise = null
    // A shared plan belongs to the account. Take it off this phone, so the next
    // person to sign in here neither sees it nor uploads it as their own plan.
    const hadPlan = Boolean(localStorage.getItem(CODE_KEY))
    if (hadPlan) for (const key of [...KEYS, 'cp-writer', 'cp-notes']) localStorage.removeItem(key)
    for (const key of [TOKEN_KEY, CODE_KEY, ROLE_KEY, EMAIL_KEY]) localStorage.removeItem(key)
    sessionStorage.removeItem(STAMP_KEY)
    sessionStorage.removeItem(BASE_KEY)
    if (hadPlan && onSync) onSync()
    setCode('')
    setRole('')
    setEmail(null)
    setSent('')
    setBusy(false)
    setStatus('Signed out on this phone. Your plan is saved to your account.')
  }

  async function create() {
    setBusy(true)
    setStatus('')
    try {
      const created = await api('/api/households', { method: 'POST', body: '{}' })
      localStorage.setItem(CODE_KEY, created.code)
      localStorage.setItem(ROLE_KEY, created.role)
      localStorage.setItem('cp-writer', created.role)
      const localState = snapshot()
      const saved = await api('/api/state', { method: 'PUT', body: JSON.stringify({ state: localState }) })
      writeBase(localState, saved.updated_at)
      whoPromise = Promise.resolve({ email, household: { code: created.code, role: created.role } })
      setCode(created.code)
      setRole(created.role)
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
      sessionStorage.removeItem(STAMP_KEY)
      sessionStorage.removeItem(BASE_KEY)
      localStorage.setItem(CODE_KEY, joined.code)
      localStorage.setItem(ROLE_KEY, joined.role)
      localStorage.setItem('cp-writer', joined.role)
      whoPromise = Promise.resolve({ email, household: { code: joined.code, role: joined.role } })
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

  if (email === undefined && !code) return null

  if (!email) {
    // A phone that joined before accounts keeps syncing, and is asked to sign in.
    const legacy = Boolean(code)
    return (
      <div className={`share-bar ${legacy ? 'on' : ''}`}>
        <div>
          <strong>{legacy ? `Shared plan ${code}` : 'Sign in to share this plan'}</strong>
          <p>{sent
            ? `We sent a sign-in link to ${sent}. Open it on this phone. It works for 15 minutes.`
            : legacy
              ? 'Add your email to keep this plan safe and open it on any device.'
              : 'We email you a link. No password to remember.'}</p>
        </div>
        {sent ? (
          <button className="btn ghost sm" type="button" onClick={() => setSent('')}>Use another email</button>
        ) : (
          <form onSubmit={requestLink}>
            <input className="share-email" type="email" autoComplete="email" inputMode="email" required value={address} onChange={(event) => setAddress(event.target.value)} placeholder="you@example.com" aria-label="Email address" />
            <button className="btn primary sm" type="submit" disabled={busy || !address.trim()}>Email me a link</button>
          </form>
        )}
        {status && <p className="lock-hint">{status}</p>}
      </div>
    )
  }

  if (!code) {
    return (
      <div className="share-bar">
        <div>
          <strong>Share this plan</strong>
          <p>Signed in as {email}. Create the plan, or join with the other parent's code.</p>
        </div>
        <button className="btn primary sm" type="button" onClick={create} disabled={busy}>Create shared plan</button>
        <form onSubmit={joinPlan}>
          <input value={join} onChange={(event) => setJoin(event.target.value)} placeholder="Enter code" maxLength={6} aria-label="Invite code" />
          <button className="btn ghost sm" type="submit" disabled={busy || join.trim().length < 6}>Join</button>
        </form>
        <button className="btn ghost sm" type="button" onClick={signOut} disabled={busy}>Sign out</button>
        {status && <p className="lock-hint">{status}</p>}
      </div>
    )
  }

  return (
    <div className="share-bar on">
      <div>
        <strong>Shared plan {code}</strong>
        <p>You are {role === 'A' ? (JSON.parse(localStorage.getItem('cp-profile') || '{}').nameA || 'Alex') : (JSON.parse(localStorage.getItem('cp-profile') || '{}').nameB || 'Sam')}, signed in as {email}. The other parent signs in and joins with this code.</p>
      </div>
      <button className="btn ghost sm" type="button" onClick={copy}>Copy code</button>
      <button className="btn ghost sm" type="button" onClick={signOut} disabled={busy}>Sign out</button>
      {status && <p className="lock-hint">{status}</p>}
    </div>
  )
}

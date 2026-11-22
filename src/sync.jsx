import React, { useEffect, useState } from 'react'
import { AccountPanel, PrivacyLink, usePrivacyCopy } from './privacy.jsx'
import { useLang } from './main.jsx'
import { SYNC_COPY, fill } from './sync-copy.js'
import { names } from './people.js'
import { layoutCopy, goToTab } from './layout-copy.js'

const KEYS = [
  'cp-custody', 'cp-locked', 'cp-lockdays', 'cp-events', 'cp-expenses', 'cp-payments', 'cp-money',
  'cp-swaps', 'cp-issues', 'cp-docs', 'cp-messages', 'cp-handovers', 'cp-rules', 'cp-profile', 'cp-activity', 'cp-family',
]
const TOKEN_KEY = 'cp-token'
const CODE_KEY = 'cp-code'
const ROLE_KEY = 'cp-role'
const EMAIL_KEY = 'cp-email'
const STAMP_KEY = 'cp-sync-stamp'
const BASE_KEY = 'cp-sync-base'
// Plan data kept on the phone. Removed when the account leaves this phone.
const PLAN_KEYS = [...KEYS, 'cp-writer', 'cp-notes', 'cp-family-later']

// An invite link (/?join=CODE) is remembered until the parent has signed in,
// because the sign-in link from the email opens without it.
const JOIN_KEY = 'cp-join-code'
function inviteCode() {
  const params = new URLSearchParams(window.location.search)
  const fromLink = (params.get('join') || '').trim().toUpperCase().slice(0, 6)
  if (fromLink) {
    try { localStorage.setItem(JOIN_KEY, fromLink) } catch {}
    params.delete('join')
    const rest = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash)
    return fromLink
  }
  try { return localStorage.getItem(JOIN_KEY) || '' } catch { return '' }
}

function InviteOther({ code, lang }) {
  const lc = layoutCopy(lang)
  const link = `${window.location.origin}/?join=${code}`
  const text = fill(lc.inviteText, { child: names(lang).child, code, link })
  return (
    <div className="invite">
      <div>
        <strong>{lc.invite}</strong>
        <p>{lc.inviteLead}</p>
      </div>
      <div className="invite-actions">
        <a className="btn primary sm" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">{lc.whatsapp}</a>
        <a className="btn ghost sm" href={`mailto:?subject=${encodeURIComponent(lc.inviteSubject)}&body=${encodeURIComponent(text)}`}>{lc.email}</a>
      </div>
    </div>
  )
}

function forgetPlanHere() {
  for (const key of PLAN_KEYS) localStorage.removeItem(key)
  for (const key of [TOKEN_KEY, CODE_KEY, ROLE_KEY, EMAIL_KEY]) localStorage.removeItem(key)
  sessionStorage.removeItem(STAMP_KEY)
  sessionStorage.removeItem(BASE_KEY)
}

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

export async function api(path, options = {}) {
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
    return api('/api/me').catch((sessionError) => {
      error.sessionStatus = sessionError.status
      throw error
    })
  }
}

export function ShareBar({ onSync, compact = false }) {
  const [code, setCode] = useState(() => localStorage.getItem(CODE_KEY) || '')
  const [role, setRole] = useState(() => localStorage.getItem(ROLE_KEY) || '')
  // undefined while we ask the server, null when signed out
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY) || undefined)
  const [address, setAddress] = useState('')
  const [sent, setSent] = useState('')
  const [join, setJoin] = useState(inviteCode)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [account, setAccount] = useState(false)
  const pc = usePrivacyCopy().ui
  const { lang } = useLang()
  const sc = SYNC_COPY[lang] || SYNC_COPY.en
  const shown = status && (sc.said[status] || status)

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
        // The code changes when the other parent deletes their account.
        if (remote.code && remote.code !== localStorage.getItem(CODE_KEY)) {
          localStorage.setItem(CODE_KEY, remote.code)
          setCode(remote.code)
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
        // This phone was signed in, and the session is gone: it ended, was signed out
        // elsewhere, or the account was deleted. The plan lives in the account, so take
        // it off this phone, as signing out does.
        // Only on a real 401 from the session check: offline or a server error keeps the plan.
        const sessionGone = (error.fromLink ? error.sessionStatus : error.status) === 401
        if (sessionGone && localStorage.getItem(EMAIL_KEY) && localStorage.getItem(CODE_KEY) && !localStorage.getItem(TOKEN_KEY)) {
          forgetPlanHere()
          if (onSync) onSync()
        }
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
    leaveThisPhone('Signed out on this phone. Your plan is saved to your account.', false)
  }

  // A shared plan belongs to the account. Take it off this phone, so the next
  // person to sign in here neither sees it nor uploads it as their own plan.
  function leaveThisPhone(message, everything) {
    whoPromise = null
    const hadPlan = Boolean(localStorage.getItem(CODE_KEY))
    if (hadPlan || everything) forgetPlanHere()
    for (const key of [TOKEN_KEY, CODE_KEY, ROLE_KEY, EMAIL_KEY]) localStorage.removeItem(key)
    sessionStorage.removeItem(STAMP_KEY)
    sessionStorage.removeItem(BASE_KEY)
    if ((hadPlan || everything) && onSync) onSync()
    setCode('')
    setRole('')
    setEmail(null)
    setSent('')
    setAccount(false)
    setBusy(false)
    setStatus(message)
  }

  function accountDeleted(message) {
    // Nothing of the account stays on this phone, not even a plan never shared.
    leaveThisPhone(message, true)
  }

  const accountButton = <button className="btn ghost sm" type="button" onClick={() => setAccount(true)} disabled={busy}>{pc.account}</button>
  const accountPanel = account && <AccountPanel email={email} onClose={() => setAccount(false)} onDeleted={accountDeleted} />

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
      // Straight into the family setup, once, for the parent who made the plan.
      if (!JSON.parse(localStorage.getItem('cp-family') || '{}').done) window.dispatchEvent(new Event('cp-open-family'))
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
      try { localStorage.removeItem(JOIN_KEY) } catch {}
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
  const lc = layoutCopy(lang)

  // Above every tab but Today, the bar shrinks to one quiet line.
  if (compact) {
    if (email && code) {
      return (
        <div className="share-line on">
          <span className="share-dot" aria-hidden="true" />
          <span>{fill(lc.sharedLine, { code })}{shown ? ` · ${shown}` : ''}</span>
        </div>
      )
    }
    return (
      <div className="share-line">
        <span className="share-dot" aria-hidden="true" />
        <span>{email ? sc.shareTitle : lc.tryLine}</span>
        <button type="button" className="btn text sm" onClick={() => goToTab('today')}>{email ? sc.create : lc.signIn}</button>
      </div>
    )
  }

  if (!email) {
    // A phone that joined before accounts keeps syncing, and is asked to sign in.
    const legacy = Boolean(code)
    return (
      <div className={`share-bar ${legacy ? 'on' : ''}`}>
        <div>
          <strong>{legacy ? fill(sc.sharedPlan, { code }) : sc.signInTitle}</strong>
          <p>{sent
            ? fill(sc.sentLink, { email: sent })
            : legacy
              ? sc.legacyLead
              : sc.signInLead}</p>
        </div>
        {sent ? (
          <button className="btn ghost sm" type="button" onClick={() => setSent('')}>{sc.otherEmail}</button>
        ) : (
          <form onSubmit={requestLink}>
            <input className="share-email" type="email" autoComplete="email" inputMode="email" required value={address} onChange={(event) => setAddress(event.target.value)} placeholder={sc.emailPlaceholder} aria-label={sc.emailLabel} />
            <button className="btn primary sm" type="submit" disabled={busy || !address.trim()}>{sc.emailMe}</button>
          </form>
        )}
        {!legacy && <p className="share-try">{lc.tryOut}</p>}
        <p className="share-privacy">{pc.signInNote} <PrivacyLink /></p>
        {shown && <p className="lock-hint">{shown}</p>}
      </div>
    )
  }

  if (!code) {
    return (
      <div className="share-bar">
        <div>
          <strong>{sc.shareTitle}</strong>
          <p>{fill(sc.signedInLead, { email })}</p>
        </div>
        <button className="btn primary sm" type="button" onClick={create} disabled={busy}>{sc.create}</button>
        <form onSubmit={joinPlan}>
          <input value={join} onChange={(event) => setJoin(event.target.value)} placeholder={sc.codePlaceholder} maxLength={6} aria-label={sc.codeLabel} />
          <button className="btn ghost sm" type="submit" disabled={busy || join.trim().length < 6}>{sc.join}</button>
        </form>
        {accountButton}
        <button className="btn ghost sm" type="button" onClick={signOut} disabled={busy}>{sc.signOut}</button>
        {shown && <p className="lock-hint">{shown}</p>}
        {accountPanel}
      </div>
    )
  }

  return (
    <div className="share-bar on">
      <div>
        <strong>{fill(sc.sharedPlan, { code })}</strong>
        <p>{fill(sc.youAre, { name: names(lang)[role === 'B' ? 'B' : 'A'], email })}</p>
      </div>
      <button className="btn ghost sm" type="button" onClick={copy}>{sc.copy}</button>
      {accountButton}
      <button className="btn ghost sm" type="button" onClick={signOut} disabled={busy}>{sc.signOut}</button>
      {shown && <p className="lock-hint">{shown}</p>}
      <InviteOther code={code} lang={lang} />
      {accountPanel}
    </div>
  )
}

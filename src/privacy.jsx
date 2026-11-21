import React, { useState } from 'react'
import { useLang } from './main.jsx'
import { fill } from './family-copy.js'
import { PRIVACY_CONTACT, PRIVACY_COPY, PRIVACY_UPDATED } from './privacy-copy.js'

export const PRIVACY_HASH = '#privacy'

export function usePrivacyCopy() {
  const { lang } = useLang()
  return PRIVACY_COPY[lang] || PRIVACY_COPY.en
}

function dateText(lang) {
  const locale = { fr: 'fr-LU', de: 'de-LU', lb: 'lb-LU' }[lang] || 'en-GB'
  try {
    return new Date(`${PRIVACY_UPDATED}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return PRIVACY_UPDATED
  }
}

// Turns the contact address and the CNPD site into links.
function Rich({ text }) {
  const filled = fill(text, PRIVACY_CONTACT)
  const parts = filled.split(/(\S+@\S+\.[a-z]{2,}|cnpd\.public\.lu)/)
  return parts.map((part, i) => {
    if (part === PRIVACY_CONTACT.email) return <a key={i} href={`mailto:${part}`}>{part}</a>
    if (part === 'cnpd.public.lu') return <a key={i} href="https://cnpd.public.lu" target="_blank" rel="noreferrer">{part}</a>
    return part
  })
}

export function PrivacyLink({ className = '' }) {
  const c = usePrivacyCopy()
  return <a className={className} href={PRIVACY_HASH}>{c.ui.notice}</a>
}

export function PrivacyPage({ onBack }) {
  const { lang } = useLang()
  const c = usePrivacyCopy()
  return (
    <div className="privacy-page">
      <div className="privacy-inner">
        <button className="btn ghost sm" type="button" onClick={onBack}>← {c.ui.back}</button>
        <h1>{c.title}</h1>
        <p className="privacy-date">{fill(c.ui.updated, { date: dateText(lang) })}</p>
        <p className="privacy-lead">{c.lead}</p>
        {c.sections.map((section) => (
          <section key={section.h}>
            <h2>{section.h}</h2>
            {(section.p || []).map((text) => <p key={text}><Rich text={text} /></p>)}
            {section.list && <ul>{section.list.map((text) => <li key={text}><Rich text={text} /></li>)}</ul>}
          </section>
        ))}
        <button className="btn ghost sm" type="button" onClick={onBack}>← {c.ui.back}</button>
      </div>
    </div>
  )
}

async function downloadData() {
  const response = await fetch('/api/account/export', { credentials: 'same-origin' })
  if (!response.ok) throw new Error(String(response.status))
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `coparents-my-data-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// The signed-in parent's privacy screen: notice, download, delete.
export function AccountPanel({ email, onClose, onDeleted }) {
  const c = usePrivacyCopy().ui
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const matches = typed.trim().toLowerCase() === String(email || '').toLowerCase()

  async function download() {
    setError('')
    try {
      await downloadData()
    } catch {
      setError(c.downloadFailed)
    }
  }

  async function remove(event) {
    event.preventDefault()
    if (!matches) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed.trim() }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`)
      const message = body.plan === 'kept' ? c.deletedKept : body.plan === 'deleted' ? c.deletedGone : c.deletedNone
      onDeleted(message)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="q-overlay" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div className="q-card account-panel" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <div className="q-head">
          <h3 id="account-title">{c.account}</h3>
          <button className="btn ghost sm" type="button" onClick={onClose} disabled={busy}>{c.close}</button>
        </div>
        <p className="q-lead">{fill(c.signedInAs, { email })}</p>

        <div className="account-block">
          <a className="btn ghost sm" href={PRIVACY_HASH} onClick={onClose}>{c.notice}</a>
        </div>

        <div className="account-block">
          <button className="btn ghost sm" type="button" onClick={download}>{c.download}</button>
          <p className="account-hint">{c.downloadHint}</p>
        </div>

        <form className="account-block account-danger" onSubmit={remove}>
          <h4>{c.deleteTitle}</h4>
          <p>{c.deleteLead}</p>
          <ul>
            <li>{c.deleteKept}</li>
            <li>{c.deleteGone}</li>
            <li>{c.deleteBackup}</li>
          </ul>
          <label htmlFor="delete-confirm">{fill(c.typeEmail, { email })}</label>
          <input
            id="delete-confirm"
            type="email"
            autoComplete="off"
            inputMode="email"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={email}
          />
          <button className="btn danger sm" type="submit" disabled={busy || !matches}>{busy ? c.deleting : c.deleteButton}</button>
        </form>
        {error && <p className="lock-hint">{error}</p>}
      </div>
    </div>
  )
}

import React, { useEffect, useMemo, useState } from 'react'
import { Camera, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import { useLang } from './main.jsx'
import { NoteThread, names, logActivity } from './extra.jsx'
import { MONEY_COPY } from './money-copy.js'
import { receiptUrl, removeReceipt, uploadReceipt } from './receipts.js'
import {
  CATEGORIES, MODES, balance, isoDay, monthOf, monthSummary, normalizeExpense, normalizeMoney,
  paymentHistory, recentMonths, shiftMonth, toAmount,
} from './money.js'

function load(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback } catch { return fallback } }
function save(key, value) {
  const next = JSON.stringify(value)
  if (localStorage.getItem(key) === next) return
  localStorage.setItem(key, next)
  window.dispatchEvent(new Event('cp-local-change'))
}
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '')
const LOCALES = { fr: 'fr-LU', de: 'de-LU', lb: 'lb-LU', en: 'en-GB' }

export function ExpensesView() {
  const { lang } = useLang()
  const c = MONEY_COPY[lang] || MONEY_COPY.en
  const n = names()
  const locale = LOCALES[lang] || 'en-GB'
  const money = (v) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(v || 0)
  const day = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  const monthName = (m) => new Date(m + '-15T12:00:00').toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  const [items, setItems] = useState(() => load('cp-expenses', []).map(normalizeExpense))
  const [payments, setPayments] = useState(() => load('cp-payments', []))
  const [settings, setSettings] = useState(() => normalizeMoney(load('cp-money', {})))
  const [choosing, setChoosing] = useState(false)
  const [editBudget, setEditBudget] = useState(false)
  const [month, setMonth] = useState(() => monthOf(isoDay()))
  useEffect(() => { save('cp-expenses', items) }, [items])
  useEffect(() => { save('cp-payments', payments) }, [payments])
  useEffect(() => { save('cp-money', settings) }, [settings])

  const mode = settings.mode
  const blank = { desc: '', amount: '', paidBy: mode === 'shared' ? 'account' : 'A', split: '50', date: isoDay(), category: 'other' }
  const [form, setForm] = useState(blank)

  const add = (e) => {
    e.preventDefault()
    const amount = toAmount(form.amount)
    if (!form.desc.trim() || !amount) return
    const item = normalizeExpense({ ...form, desc: form.desc.trim(), amount, id: Date.now(), settled: false })
    setItems((p) => [...p, item])
    setForm({ ...blank, paidBy: form.paidBy, date: form.date, category: form.category })
    setMonth(monthOf(item.date))
  }
  const remove = (id) => {
    const item = items.find((x) => x.id === id)
    setItems((p) => p.filter((x) => x.id !== id))
    for (const photo of item?.receipts || []) removeReceipt(photo).catch(() => {})
  }
  const [busyPhoto, setBusyPhoto] = useState(null)
  const [photoError, setPhotoError] = useState({})
  const [viewing, setViewing] = useState(null)
  const addPhoto = async (id, file) => {
    if (!file) return
    setBusyPhoto(id)
    setPhotoError((e) => ({ ...e, [id]: '' }))
    try {
      const photo = await uploadReceipt(file)
      setItems((p) => p.map((x) => (x.id === id ? { ...x, receipts: [...(x.receipts || []), photo] } : x)))
    } catch (error) {
      const msg = error.status === 401 ? c.photoSignIn : (c.photoErrors[error.message] || c.photoFailed)
      setPhotoError((e) => ({ ...e, [id]: msg }))
    } finally {
      setBusyPhoto(null)
    }
  }
  const dropPhoto = async (id, photo) => {
    setItems((p) => p.map((x) => (x.id === id ? { ...x, receipts: (x.receipts || []).filter((r) => r !== photo) } : x)))
    setViewing(null)
    removeReceipt(photo).catch(() => {})
  }
  const settle = (id) => {
    const today = isoDay()
    setItems((p) => p.map((x) => (x.id === id ? { ...x, settled: true, settledAt: today } : x)))
    const item = items.find((x) => x.id === id)
    if (item) logActivity(`${n[item.paidBy] || c.account}: “${item.desc}” ${fill(c.settledOn, { date: day(today) })}`)
  }

  const owed = useMemo(() => balance(items), [items])
  const summary = useMemo(() => monthSummary(items, month, settings.budget), [items, month, settings.budget])
  const shown = items.filter((it) => monthOf(it.date) === month).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  const setBudget = (cat, value) => setSettings((s) => ({ ...s, budget: { ...s.budget, [cat]: toAmount(value) || undefined } }))

  if (!mode || choosing) {
    return (
      <div className="app-panel">
        <h2>{c.title}</h2>
        <p className="q-lead">{c.modeLead}</p>
        <label className="money-label">{c.modeTitle}</label>
        <div className="q-options">
          {MODES.map((m) => (
            <button key={m} type="button" className={mode === m ? 'on' : ''} onClick={() => { setSettings((s) => ({ ...s, mode: m })); setForm((f) => ({ ...f, paidBy: m === 'shared' ? 'account' : (f.paidBy === 'account' ? 'A' : f.paidBy) })); setChoosing(false) }}>
              <strong>{c.modes[m][0]}</strong>
              <span className="money-option-text">{c.modes[m][1]}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const kind = mode === 'shared' ? 'deposit' : mode === 'support' ? 'support' : null
  const payers = mode === 'shared' ? ['A', 'B'] : [settings.support.payer]
  const agreed = mode === 'shared' ? settings.monthly : { [settings.support.payer]: settings.support.amount }

  return (
    <div className="app-panel money">
      {viewing && (
        <div className="q-overlay" onClick={() => setViewing(null)}>
          <div className="receipt-view" onClick={(e) => e.stopPropagation()}>
            <img src={receiptUrl(viewing.photo)} alt={c.photoAlt} />
            <div className="receipt-view-actions">
              <button className="btn ghost sm" type="button" onClick={() => dropPhoto(viewing.id, viewing.photo)}><Trash2 size={15} /> {c.photoRemove}</button>
              <button className="btn primary sm" type="button" onClick={() => setViewing(null)}><X size={15} /> {c.close}</button>
            </div>
          </div>
        </div>
      )}
      <div className="panel-head">
        <h2>{c.title}</h2>
        <div className="money-mode">
          <span>{c.modes[mode][0]}</span>
          <button className="btn ghost sm" type="button" onClick={() => setChoosing(true)}>{c.change}</button>
        </div>
      </div>

      {kind && (
        <Payments
          c={c} n={n} kind={kind} mode={mode} payers={payers} agreed={agreed} settings={settings} setSettings={setSettings}
          payments={payments} setPayments={setPayments} money={money} day={day} monthName={monthName}
        />
      )}

      <section className="money-section">
        <div className="money-section-head">
          <h3>{c.costsTitle}</h3>
          <div className="month-nav">
            <button className="btn ghost sm" type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="previous"><ChevronLeft size={16} /></button>
            <strong className="money-month">{monthName(month)}</strong>
            <button className="btn ghost sm" type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="next"><ChevronRight size={16} /></button>
          </div>
        </div>
        {mode !== 'shared' || items.some((it) => it.paidBy !== 'account') ? (
          <p className="money-owed">{owed.a > 0 ? fill(c.owed, { name: n.A, amount: money(owed.a) }) : owed.b > 0 ? fill(c.owed, { name: n.B, amount: money(owed.b) }) : c.even}</p>
        ) : null}
        <div className="expense-list">
          {shown.length === 0 && <p className="empty">{c.noCosts}</p>}
          {shown.map((it) => (
            <div key={it.id} className={`expense-block ${it.settled ? 'settled' : ''}`}>
              <div className="expense-row">
                <div>
                  <strong>{it.desc}</strong>
                  <span className="meta">
                    {day(it.date)} · {c.categories[it.category]} · {c.paidBy} {it.paidBy === 'account' ? c.account : n[it.paidBy]}
                    {it.paidBy !== 'account' && <> · {c.split} {it.split === '50' ? c.split50 : fill(c.all, { name: n[it.split] })}</>}
                  </span>
                </div>
                <div className="amt">{money(it.amount)}</div>
                {it.paidBy !== 'account' && it.split !== it.paidBy && (it.settled
                  ? <span className="meta">{it.settledAt ? fill(c.settledOn, { date: day(it.settledAt) }) : c.markSettled}</span>
                  : <button className="btn ghost sm" type="button" onClick={() => settle(it.id)}>{c.markSettled}</button>)}
                <button className="btn ghost" type="button" onClick={() => remove(it.id)} aria-label={c.remove}><Trash2 size={16} /></button>
              </div>
              <div className="receipt-strip">
                {(it.receipts || []).map((photo) => (
                  <button key={photo} type="button" className="receipt-thumb" onClick={() => setViewing({ id: it.id, photo })} aria-label={c.photoOpen}>
                    <img src={receiptUrl(photo)} alt={c.photoAlt} loading="lazy" />
                  </button>
                ))}
                <label className={`btn ghost sm receipt-add ${busyPhoto === it.id ? 'busy' : ''}`}>
                  <Camera size={15} /> {busyPhoto === it.id ? c.photoSending : c.photoAdd}
                  <input type="file" accept="image/*" hidden disabled={busyPhoto === it.id}
                    onChange={(e) => { addPhoto(it.id, e.target.files?.[0]); e.target.value = '' }} />
                </label>
                {photoError[it.id] && <span className="receipt-error">{photoError[it.id]}</span>}
              </div>
              <NoteThread channel={`expense:${it.id}`} title={c.notes} />
            </div>
          ))}
        </div>
        <form className="add-form" onSubmit={add}>
          <input placeholder={c.desc} aria-label={c.desc} value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
          <input type="number" inputMode="decimal" step="0.01" min="0" placeholder={c.amount} aria-label={c.amount} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input type="date" aria-label={c.date} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value || isoDay() })} />
          <select aria-label={c.category} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((cat) => <option key={cat} value={cat}>{c.categories[cat]}</option>)}
          </select>
          <select aria-label={c.paidBy} value={form.paidBy} onChange={(e) => setForm({ ...form, paidBy: e.target.value })}>
            {mode === 'shared' && <option value="account">{c.paidBy} {c.account}</option>}
            <option value="A">{c.paidBy} {n.A}</option>
            <option value="B">{c.paidBy} {n.B}</option>
          </select>
          {form.paidBy !== 'account' && (
            <select aria-label={c.split} value={form.split} onChange={(e) => setForm({ ...form, split: e.target.value })}>
              <option value="50">{c.split50}</option>
              <option value="A">{fill(c.all, { name: n.A })}</option>
              <option value="B">{fill(c.all, { name: n.B })}</option>
            </select>
          )}
          <button className="btn primary" type="submit"><Plus size={16} /> {c.add}</button>
        </form>
      </section>

      <section className="money-section">
        <div className="money-section-head">
          <h3>{c.summaryTitle} · {monthName(month)}</h3>
          <button className="btn ghost sm" type="button" onClick={() => setEditBudget((v) => !v)}>{editBudget ? c.done : c.setBudget}</button>
        </div>
        {editBudget && <p className="q-lead">{c.budgetLead}</p>}
        <div className="money-summary">
          {summary.rows.filter((r) => editBudget || r.spent > 0 || r.budget > 0).map((r) => (
            <div key={r.category} className={`money-row ${r.over ? 'over' : ''}`}>
              <span className="money-cat">{c.categories[r.category]}</span>
              <span className="money-spent">{money(r.spent)}</span>
              {editBudget ? (
                <input type="number" inputMode="decimal" min="0" step="1" aria-label={`${c.budget} ${c.categories[r.category]}`} placeholder={c.budget}
                  value={settings.budget[r.category] || ''} onChange={(e) => setBudget(r.category, e.target.value)} />
              ) : r.budget > 0 ? (
                <span className="money-budget">
                  <span className="money-bar"><span style={{ width: `${Math.min(100, (r.spent / r.budget) * 100)}%` }} /></span>
                  {r.over ? c.over : fill(c.left, { amount: money(r.budget - r.spent) })} · {money(r.budget)}
                </span>
              ) : <span />}
            </div>
          ))}
          {summary.total === 0 && !editBudget && <p className="empty">{c.noCosts}</p>}
          {summary.total > 0 && (
            <div className="money-row total">
              <span className="money-cat">{c.total}</span>
              <span className="money-spent">{money(summary.total)}</span>
              <span>{summary.totalBudget > 0 ? `${c.budget} ${money(summary.totalBudget)}` : ''}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function Payments({ c, n, kind, mode, payers, agreed, settings, setSettings, payments, setPayments, money, day, monthName }) {
  const [form, setForm] = useState({ who: payers[0], amount: '', date: isoDay() })
  useEffect(() => { if (!payers.includes(form.who)) setForm((f) => ({ ...f, who: payers[0] })) }, [payers.join()])
  // The newest month shown; the arrows move back and forward, so older or future-dated payments stay reachable.
  const [last, setLast] = useState(() => monthOf(isoDay()))
  const history = paymentHistory(payments, kind, payers, agreed, recentMonths(last, 4))
  const record = (e) => {
    e.preventDefault()
    const amount = toAmount(form.amount || agreed[form.who])
    if (!amount) return
    setPayments((p) => [...p, { id: Date.now(), kind, who: form.who, amount, date: form.date || isoDay() }])
    logActivity(`${n[form.who]}: ${money(amount)} · ${day(form.date || isoDay())}`)
    setForm((f) => ({ ...f, amount: '' }))
    const m = monthOf(form.date || isoDay())
    if (!recentMonths(last, 4).includes(m)) setLast(m)
  }
  const removePayment = (id) => setPayments((p) => p.filter((x) => x.id !== id))
  const mine = (who, month) => payments.filter((p) => p.kind === kind && p.who === who && monthOf(p.date) === month)

  return (
    <section className="money-section">
      <div className="money-section-head">
        <h3>{mode === 'shared' ? c.depositsTitle : c.supportTitle}</h3>
        <div className="month-nav">
          <button className="btn ghost sm" type="button" onClick={() => setLast((m) => shiftMonth(m, -4))} aria-label="previous"><ChevronLeft size={16} /></button>
          <button className="btn ghost sm" type="button" onClick={() => setLast((m) => shiftMonth(m, 4))} aria-label="next"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="money-agreed">
        {mode === 'support' && (
          <label>{c.payer}
            <select value={settings.support.payer} onChange={(e) => setSettings((s) => ({ ...s, support: { ...s.support, payer: e.target.value } }))}>
              <option value="A">{n.A}</option>
              <option value="B">{n.B}</option>
            </select>
          </label>
        )}
        {payers.map((who) => (
          <label key={who}>{c.agreed}{mode === 'shared' ? ` · ${n[who]}` : ''}
            <input type="number" inputMode="decimal" min="0" step="1" value={agreed[who] || ''}
              onChange={(e) => {
                const v = toAmount(e.target.value)
                setSettings((s) => mode === 'shared'
                  ? { ...s, monthly: { ...s.monthly, [who]: v } }
                  : { ...s, support: { ...s.support, amount: v } })
              }} />
          </label>
        ))}
      </div>
      <div className="money-history">
        {history.map(({ month, cells }) => (
          <div key={month} className="money-history-row">
            <span className="money-cat">{monthName(month)}</span>
            {cells.map((cell) => (
              <span key={cell.who} className={`money-cell ${cell.recorded ? 'paid' : 'none'}`}>
                {payers.length > 1 && <strong>{n[cell.who]} </strong>}
                {cell.recorded
                  ? <>
                      {fill(c.paidOn, { amount: cell.short ? fill(c.partOf, { paid: money(cell.paid), due: money(cell.due) }) : money(cell.paid), dates: cell.dates.map(day).join(', ') })}
                      {mine(cell.who, month).map((p) => (
                        <button key={p.id} className="btn ghost sm money-x" type="button" onClick={() => removePayment(p.id)} aria-label={c.remove}>×</button>
                      ))}
                    </>
                  : c.notRecorded}
              </span>
            ))}
          </div>
        ))}
      </div>
      <form className="add-form" onSubmit={record}>
        {payers.length > 1 && (
          <select aria-label={c.payer} value={form.who} onChange={(e) => setForm({ ...form, who: e.target.value })}>
            {payers.map((who) => <option key={who} value={who}>{n[who]}</option>)}
          </select>
        )}
        <input type="number" inputMode="decimal" step="0.01" min="0" aria-label={c.amount} placeholder={agreed[form.who] ? money(agreed[form.who]) : c.amount} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <input type="date" aria-label={c.date} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <button className="btn primary" type="submit"><Plus size={16} /> {c.record}</button>
      </form>
    </section>
  )
}

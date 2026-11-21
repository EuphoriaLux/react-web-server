import React, { useMemo, useState } from 'react'
import { useLang } from './main.jsx'
import { FAMILY_COPY, fill } from './family-copy.js'
import {
  CARE_TYPES, RHYTHMS, RULINGS, emptyChild, emptyActivity, familyFromProfile, normalizeFamily,
  profileFromFamily, canFinish, cleanFamily, fillCustody, activitiesOn, describeChanges, namedChildren,
} from './family.js'

const LATER_KEY = 'cp-family-later'

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function save(key, value) {
  const next = JSON.stringify(value)
  if (localStorage.getItem(key) === next) return
  localStorage.setItem(key, next)
  window.dispatchEvent(new Event('cp-local-change'))
}
function addActivity(text) {
  const all = load('cp-activity', [])
  save('cp-activity', [{ id: String(Date.now()), at: new Date().toISOString(), text }, ...all].slice(0, 40))
}

export function useFamilyCopy() {
  const { lang } = useLang()
  return FAMILY_COPY[lang] || FAMILY_COPY.en
}

export function myRole() {
  const role = localStorage.getItem('cp-role') || load('cp-writer', 'A')
  return role === 'B' ? 'B' : 'A'
}

export function loadFamily() {
  return normalizeFamily(load('cp-family', null))
}

export function openFamilySetup() {
  window.dispatchEvent(new Event('cp-open-family'))
}

function parentName(family, role) {
  const fallback = load('cp-profile', {})[role === 'B' ? 'nameB' : 'nameA'] || (role === 'B' ? 'Sam' : 'Alex')
  return family?.parents?.[role]?.name || fallback
}

function storeFamily(family) {
  save('cp-family', family)
  save('cp-profile', profileFromFamily(family, load('cp-profile', undefined)))
}

/* ─── The four-screen setup ─── */

export function FamilySetup({ onClose }) {
  const c = useFamilyCopy()
  const role = myRole()
  const other = role === 'A' ? 'B' : 'A'
  const before = useMemo(() => loadFamily(), [])
  const [draft, setDraft] = useState(() => before || familyFromProfile(load('cp-profile', null)))
  const [step, setStep] = useState(0)
  const [healthOpen, setHealthOpen] = useState(() => Object.fromEntries((draft.children || []).filter((child) => child.health).map((child) => [child.id, true])))
  const [prefill, setPrefill] = useState(true)
  const [error, setError] = useState('')

  const nameA = draft.parents.A.name.trim() || (role === 'A' ? c.yourName : c.otherParent)
  const nameB = draft.parents.B.name.trim() || (role === 'B' ? c.yourName : c.otherParent)
  const names = { A: nameA, B: nameB }

  const setParent = (who, name) => setDraft({ ...draft, parents: { ...draft.parents, [who]: { name } } })
  const setChild = (id, patch) => setDraft({ ...draft, children: draft.children.map((child) => (child.id === id ? { ...child, ...patch } : child)) })
  const setAct = (id, patch) => setDraft({ ...draft, activities: draft.activities.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
  const setCustody = (patch) => setDraft({ ...draft, custody: { ...draft.custody, ...patch } })

  // Answers are kept as the parent goes, so closing the page loses nothing.
  function keep(next = draft) {
    if (!before?.done) save('cp-family', { ...next, done: false })
  }
  function go(to) {
    keep()
    setError('')
    setStep(to)
  }
  function later() {
    keep()
    onClose()
  }
  function finish() {
    if (!canFinish(draft, role)) {
      setError(c.needed)
      if (!draft.parents[role].name.trim()) setStep(0)
      else setStep(1)
      return
    }
    const clean = cleanFamily(draft)
    const changes = describeChanges(before, clean)
    const next = {
      ...clean,
      done: true,
      filledBy: before?.filledBy || role,
      editedBy: role,
      confirmed: before?.done && changes.length
        ? { [role]: true, [other]: false }
        : { ...clean.confirmed, [role]: true },
    }
    storeFamily(next)
    const me = parentName(next, role)
    if (!before?.done) addActivity(fill(c.actFilled, { name: me }))
    else if (changes.length) addActivity(fill(c.actChanged, { name: me, what: changes.map((key) => c.what[key]).join(', ') }))
    if (prefill && next.custody.rhythm && next.custody.rhythm !== 'undecided') {
      const filled = fillCustody(load('cp-custody', {}), next.custody.rhythm, new Date(), 12, load('cp-locked', {}))
      if (filled.added) save('cp-custody', filled.custody)
    }
    localStorage.removeItem(LATER_KEY)
    onClose()
  }

  const kids = draft.children
  const named = namedChildren(draft)

  return (
    <div className="q-overlay">
      <div className="q-card family-setup" role="dialog" aria-modal="true" aria-labelledby="family-title">
        <div className="q-head">
          <h3 id="family-title">{c.setupTitle}</h3>
          <button className="btn ghost sm" type="button" onClick={later}>{before?.done ? c.back : c.later}</button>
        </div>
        <ol className="family-steps" aria-label={fill(c.step, { n: step + 1 })}>
          {c.steps.map((label, index) => (
            <li key={label} className={index === step ? 'on' : index < step ? 'done' : ''}>
              <button type="button" onClick={() => go(index)}>{label}</button>
            </li>
          ))}
        </ol>
        {step === 0 && <p className="q-lead">{c.setupLead}</p>}

        {step === 0 && (
          <div className="biff">
            <label>{c.yourName}<input autoFocus value={draft.parents[role].name} onChange={(event) => setParent(role, event.target.value)} autoComplete="given-name" /></label>
            <label>{c.otherName}<input value={draft.parents[other].name} onChange={(event) => setParent(other, event.target.value)} /></label>
          </div>
        )}

        {step === 1 && (
          <div className="family-kids">
            {kids.map((child, index) => (
              <fieldset key={child.id} className="family-kid">
                <legend>{child.name || `${c.child} ${index + 1}`}</legend>
                <div className="biff">
                  <div className="family-row">
                    <label>{c.childName}<input value={child.name} onChange={(event) => setChild(child.id, { name: event.target.value })} /></label>
                    <label className="narrow">{c.birthYear}<input inputMode="numeric" maxLength={4} value={child.birthYear} onChange={(event) => setChild(child.id, { birthYear: event.target.value.replace(/\D/g, '') })} /></label>
                  </div>
                </div>
                <label>{c.care}</label>
                <div className="q-options family-chips">
                  {CARE_TYPES.map((type) => (
                    <button key={type} type="button" className={child.care === type ? 'on' : ''} onClick={() => setChild(child.id, { care: child.care === type ? '' : type })}>{c.careTypes[type]}</button>
                  ))}
                </div>
                {child.care && child.care !== 'home' && (
                  <div className="biff">
                    <label>{c.place}<input value={child.place} onChange={(event) => setChild(child.id, { place: event.target.value })} /></label>
                    <label>{c.group}<input value={child.group} onChange={(event) => setChild(child.id, { group: event.target.value })} /></label>
                  </div>
                )}
                {kids.length > 1 && (
                  <button type="button" className="btn ghost sm family-remove" onClick={() => setDraft({ ...draft, children: kids.filter((item) => item.id !== child.id) })}>{c.remove}</button>
                )}
              </fieldset>
            ))}
            <button type="button" className="btn ghost sm" onClick={() => setDraft({ ...draft, children: [...kids, emptyChild()] })}>+ {c.addChild}</button>
          </div>
        )}

        {step === 2 && (
          <div>
            <label>{c.activities}</label>
            <p className="q-lead">{c.activitiesLead}</p>
            {draft.activities.length === 0 && <p className="empty">{c.noActivities}</p>}
            {draft.activities.map((item) => (
              <fieldset key={item.id} className="family-kid">
                <div className="biff">
                  <label>{c.activityName}<input value={item.name} onChange={(event) => setAct(item.id, { name: event.target.value })} /></label>
                  <div className="family-row">
                    <label>{c.day}
                      <select value={item.day} onChange={(event) => setAct(item.id, { day: Number(event.target.value) })}>
                        {c.days.map((day, index) => <option key={day} value={index}>{day}</option>)}
                      </select>
                    </label>
                    <label className="narrow">{c.time}<input type="time" value={item.time} onChange={(event) => setAct(item.id, { time: event.target.value })} /></label>
                  </div>
                  <div className="family-row">
                    {named.length > 1 && (
                      <label>{c.forChild}
                        <select value={item.childId} onChange={(event) => setAct(item.id, { childId: event.target.value })}>
                          <option value="all">{c.allChildren}</option>
                          {named.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
                        </select>
                      </label>
                    )}
                    <label>{c.who}
                      <select value={item.who} onChange={(event) => setAct(item.id, { who: event.target.value })}>
                        <option value="">{c.whoEither}</option>
                        <option value="A">{nameA}</option>
                        <option value="B">{nameB}</option>
                      </select>
                    </label>
                  </div>
                </div>
                <button type="button" className="btn ghost sm family-remove" onClick={() => setDraft({ ...draft, activities: draft.activities.filter((row) => row.id !== item.id) })}>{c.remove}</button>
              </fieldset>
            ))}
            <button type="button" className="btn ghost sm" onClick={() => setDraft({ ...draft, activities: [...draft.activities, emptyActivity()] })}>+ {c.addActivity}</button>

            <label>{c.health}</label>
            {named.length === 0 && <p className="empty">{c.noFamily}</p>}
            {named.map((child) => (
              <div key={child.id} className="family-health">
                {healthOpen[child.id] ? (
                  <div className="biff">
                    <label>{child.name}
                      <textarea value={child.health} onChange={(event) => setChild(child.id, { health: event.target.value })} maxLength={600} />
                    </label>
                  </div>
                ) : (
                  <button type="button" className="btn ghost sm" onClick={() => setHealthOpen({ ...healthOpen, [child.id]: true })}>+ {c.healthAdd}: {child.name}</button>
                )}
              </div>
            ))}
            {Object.values(healthOpen).some(Boolean) && <p className="family-note">{c.healthHint}</p>}
          </div>
        )}

        {step === 3 && (
          <div>
            <label>{c.rhythm}</label>
            <div className="q-options">
              {RHYTHMS.map((rhythm) => (
                <button key={rhythm} type="button" className={draft.custody.rhythm === rhythm ? 'on' : ''} onClick={() => setCustody({ rhythm: draft.custody.rhythm === rhythm ? '' : rhythm })}>
                  {fill(c.rhythms[rhythm], names)}
                </button>
              ))}
            </div>
            {draft.custody.rhythm && draft.custody.rhythm !== 'undecided' && (
              <label className="family-check">
                <input type="checkbox" checked={prefill} onChange={(event) => setPrefill(event.target.checked)} />
                <span>{c.prefill}</span>
              </label>
            )}
            <label>{c.handover}</label>
            <div className="biff">
              <div className="family-row">
                <label>{c.handoverDay}
                  <select value={draft.custody.handoverDay} onChange={(event) => setCustody({ handoverDay: event.target.value })}>
                    <option value="">–</option>
                    {c.days.map((day, index) => <option key={day} value={String(index)}>{day}</option>)}
                  </select>
                </label>
                <label className="narrow">{c.handoverTime}<input type="time" value={draft.custody.handoverTime} onChange={(event) => setCustody({ handoverTime: event.target.value })} /></label>
              </div>
              <label>{c.handoverPlace}<input value={draft.custody.handoverPlace} onChange={(event) => setCustody({ handoverPlace: event.target.value })} /></label>
            </div>
            <label>{c.ruling}</label>
            <div className="q-options family-chips">
              {RULINGS.map((value) => (
                <button key={value} type="button" className={draft.custody.ruling === value ? 'on' : ''} onClick={() => setCustody({ ruling: draft.custody.ruling === value ? '' : value })}>{c.rulings[value]}</button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="lock-hint">{error}</p>}
        <div className="q-actions family-actions">
          {step > 0 && <button type="button" className="btn ghost sm" onClick={() => go(step - 1)}>{c.back}</button>}
          <span className="family-spacer" />
          {step < 3 && <button type="button" className="btn ghost sm" onClick={() => go(step + 1)}>{c.skip}</button>}
          {step < 3
            ? <button type="button" className="btn primary sm" onClick={() => go(step + 1)}>{c.next}</button>
            : <button type="button" className="btn primary sm" onClick={finish}>{c.finish}</button>}
        </div>
      </div>
    </div>
  )
}

/* ─── Read-only summary, used on the Family page and the confirm card ─── */

function FamilySummary({ family }) {
  const c = useFamilyCopy()
  const kids = namedChildren(family)
  const names = { A: parentName(family, 'A'), B: parentName(family, 'B') }
  const byId = Object.fromEntries(kids.map((child) => [child.id, child.name]))
  const { rhythm, handoverDay, handoverTime, handoverPlace, ruling } = family.custody
  const handover = [handoverDay !== '' ? c.days[Number(handoverDay)] : '', handoverTime, handoverPlace].filter(Boolean).join(' · ')
  return (
    <div className="family-summary">
      <p className="family-parents">{names.A} · {names.B}</p>
      {kids.map((child) => (
        <article key={child.id} className="today-card">
          <span>{c.child}</span>
          <strong>{child.name}{child.birthYear ? `, ${fill(c.born, { year: child.birthYear })}` : ''}</strong>
          {child.care && <p>{[c.careTypes[child.care], child.place, child.group].filter(Boolean).join(' · ')}</p>}
          {child.health && <p className="family-health-text"><b>{c.health}:</b> {child.health}</p>}
        </article>
      ))}
      {family.activities.length > 0 && (
        <article className="today-card">
          <span>{c.activities}</span>
          {family.activities.map((item) => (
            <p key={item.id}>
              {c.days[item.day]}{item.time ? ` ${item.time}` : ''}: {item.name}
              {item.childId !== 'all' && byId[item.childId] ? ` (${byId[item.childId]})` : ''}
              {item.who ? ` · ${names[item.who]}` : ''}
            </p>
          ))}
        </article>
      )}
      {(rhythm || handover || ruling) && (
        <article className="today-card">
          <span>{c.custody}</span>
          {rhythm && <p>{fill(c.rhythms[rhythm], names)}</p>}
          {handover && <p>{c.handover}: {handover}</p>}
          {ruling && <p>{c.rulingSummary[ruling]}</p>}
        </article>
      )}
    </div>
  )
}

export function FamilyView() {
  const c = useFamilyCopy()
  const family = loadFamily()
  return (
    <div className="app-panel">
      <div className="panel-head">
        <h2>{c.family}</h2>
        <button type="button" className="btn primary sm" onClick={openFamilySetup}>{family?.done ? c.edit : c.start}</button>
      </div>
      {family && namedChildren(family).length > 0 ? <FamilySummary family={family} /> : <p className="empty">{c.noFamily}</p>}
    </div>
  )
}

/* ─── Today board: finish banner, or the other parent's confirm card ─── */

export function FamilyPrompt() {
  const c = useFamilyCopy()
  const role = myRole()
  const [family, setFamily] = useState(() => loadFamily())
  const [hidden, setHidden] = useState(() => localStorage.getItem(LATER_KEY) === '1')

  if (!family?.done) {
    if (hidden) return null
    return (
      <article className="family-banner">
        <div>
          <strong>{c.banner}</strong>
          <p>{c.bannerLead}</p>
        </div>
        <div className="family-banner-actions">
          <button type="button" className="btn primary sm" onClick={openFamilySetup}>{c.start}</button>
          <button type="button" className="btn ghost sm" onClick={() => { localStorage.setItem(LATER_KEY, '1'); setHidden(true) }}>{c.notNow}</button>
        </div>
      </article>
    )
  }
  if (family.confirmed[role] || (family.editedBy || family.filledBy) === role) return null
  const author = parentName(family, family.editedBy || family.filledBy || (role === 'A' ? 'B' : 'A'))
  function confirm() {
    const next = { ...family, confirmed: { ...family.confirmed, [role]: true } }
    storeFamily(next)
    addActivity(fill(c.actConfirmed, { name: parentName(next, role) }))
    setFamily(next)
  }
  return (
    <article className="family-banner confirm">
      <strong>{fill(c.confirmTitle, { name: author })}</strong>
      <FamilySummary family={family} />
      <div className="family-banner-actions">
        <button type="button" className="btn primary sm" onClick={confirm}>{c.confirm}</button>
        <button type="button" className="btn ghost sm" onClick={openFamilySetup}>{c.edit}</button>
      </div>
    </article>
  )
}

export function TodayActivities() {
  const c = useFamilyCopy()
  const family = loadFamily()
  const today = activitiesOn(family, new Date())
  if (!today.length) return null
  const names = { A: parentName(family, 'A'), B: parentName(family, 'B') }
  const byId = Object.fromEntries(namedChildren(family).map((child) => [child.id, child.name]))
  return (
    <article className="today-card">
      <span>{c.todayActs}</span>
      {today.map((item) => (
        <p key={item.id}>
          {item.time ? `${item.time} ` : ''}{item.name}
          {item.childId !== 'all' && byId[item.childId] ? ` (${byId[item.childId]})` : ''}
          {item.who ? ` · ${names[item.who]}` : ''}
        </p>
      ))}
    </article>
  )
}

export function childrenAreWith() {
  const family = loadFamily()
  return family ? namedChildren(family).length > 1 : false
}

/* ─── Documents: school and care contacts from the setup ─── */

export function PapersFamilyCard() {
  const c = useFamilyCopy()
  const family = loadFamily()
  if (!family?.done) return null
  const places = namedChildren(family).filter((child) => child.place)
  const ruling = family.custody.ruling
  if (!places.length && ruling !== 'yes' && ruling !== 'pending') return null
  return (
    <article className="fiscal-card family-papers">
      <h3>{c.papersCard}</h3>
      {places.map((child) => (
        <p key={child.id}><b>{child.name}:</b> {[c.careTypes[child.care], child.place, child.group].filter(Boolean).join(' · ')}</p>
      ))}
      {ruling === 'yes' && <p>{c.rulingHint}</p>}
      {ruling === 'pending' && <p>{c.rulingPendingHint}</p>}
    </article>
  )
}

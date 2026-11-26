// The family details both parents share: who the children are, where they go
// during the day, their regular activities and how care is shared today.
// Stored in the shared plan under `cp-family`. Plain data, no React, so it can
// be tested with node.

export const CARE_TYPES = ['creche', 'maison-relais', 'school', 'secondary', 'home', 'other']
export const RHYTHMS = ['weeks', '2-2-3', 'weekend-mid', 'mostly-A', 'mostly-B', 'undecided']
export const RULINGS = ['yes', 'no', 'pending']

let counter = 0
export function newId() {
  counter += 1
  return `${Date.now().toString(36)}${counter.toString(36)}`
}

export function emptyChild() {
  return { id: newId(), name: '', birthYear: '', care: '', place: '', group: '', health: '' }
}

export function emptyActivity(childId = 'all') {
  return { id: newId(), childId, name: '', day: 2, time: '', who: '' }
}

export function emptyFamily() {
  return {
    v: 1,
    parents: { A: { name: '' }, B: { name: '' } },
    children: [emptyChild()],
    activities: [],
    // flip: 'yes' starts the rhythm one week later, which swaps the two
    // parents' days (weeks, 2-2-3) or whose weekend it is (the others).
    custody: { rhythm: '', flip: '', handoverDay: '', handoverTime: '', handoverPlace: '', ruling: '' },
    filledBy: '',
    done: false,
    confirmed: { A: false, B: false },
  }
}

const DEMO_NAMES = { nameA: 'Alex', nameB: 'Sam', child: 'Noa' }

// Start from the names already set on the old Names panel, but not from the
// demo names a fresh app shows.
export function familyFromProfile(profile) {
  const family = emptyFamily()
  if (!profile) return family
  const real = (key) => (profile[key] && profile[key] !== DEMO_NAMES[key] ? String(profile[key]) : '')
  family.parents.A.name = real('nameA')
  family.parents.B.name = real('nameB')
  family.children[0].name = real('child')
  return family
}

// Fill in anything an older or partial saved family is missing.
export function normalizeFamily(raw) {
  if (!raw || typeof raw !== 'object') return null
  const base = emptyFamily()
  const children = Array.isArray(raw.children) && raw.children.length
    ? raw.children.map((child) => ({ ...emptyChild(), ...child }))
    : base.children
  return {
    ...base,
    ...raw,
    parents: { A: { ...base.parents.A, ...(raw.parents?.A || {}) }, B: { ...base.parents.B, ...(raw.parents?.B || {}) } },
    children,
    activities: Array.isArray(raw.activities) ? raw.activities.map((item) => ({ ...emptyActivity(), ...item })) : [],
    custody: { ...base.custody, ...(raw.custody || {}) },
    confirmed: { ...base.confirmed, ...(raw.confirmed || {}) },
  }
}

export function namedChildren(family) {
  return (family?.children || []).filter((child) => child.name.trim())
}

// What the rest of the app reads as the child's name.
export function childrenLabel(family, fallback = '') {
  const list = namedChildren(family).map((child) => child.name.trim())
  if (list.length === 0) return fallback
  if (list.length === 1) return list[0]
  return `${list.slice(0, -1).join(', ')} & ${list[list.length - 1]}`
}

// The old profile shape that the Today, Handover and share screens still read.
// A name nobody typed stays empty, and screens show "Parent A" or "Your child".
export function profileFromFamily(family, previous = {}) {
  const keep = (key) => (previous && previous[key] && previous[key] !== DEMO_NAMES[key] ? previous[key] : '')
  return {
    nameA: family.parents.A.name.trim() || keep('nameA'),
    nameB: family.parents.B.name.trim() || keep('nameB'),
    child: childrenLabel(family, keep('child')),
  }
}

// The two answers needed to finish: your own first name and one child.
export function canFinish(family, role) {
  return Boolean(family.parents[role === 'B' ? 'B' : 'A'].name.trim()) && namedChildren(family).length > 0
}

// Drop blank rows and trim text before saving a finished family.
export function cleanFamily(family) {
  const trim = (value) => (typeof value === 'string' ? value.trim() : value)
  const children = family.children
    .map((child) => Object.fromEntries(Object.entries(child).map(([key, value]) => [key, trim(value)])))
    .filter((child) => child.name)
  const ids = new Set(children.map((child) => child.id))
  const activities = family.activities
    .map((item) => ({ ...item, name: trim(item.name), time: trim(item.time) }))
    .filter((item) => item.name)
    .map((item) => (item.childId === 'all' || ids.has(item.childId) ? item : { ...item, childId: 'all' }))
  return {
    ...family,
    parents: { A: { name: trim(family.parents.A.name) }, B: { name: trim(family.parents.B.name) } },
    children: children.length ? children : family.children.slice(0, 1),
    activities,
    custody: Object.fromEntries(Object.entries(family.custody).map(([key, value]) => [key, trim(value)])),
  }
}

// Monday = 0 ... Sunday = 6, the order the calendar uses.
export function weekday(date) {
  return (date.getDay() + 6) % 7
}

function isoDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Who has the children on a day, for a rhythm, counting weeks from `start`'s
// Monday. Parent A starts, unless `flip` moves the rhythm on by one week.
export function rhythmOwner(rhythm, date, start, flip = false) {
  const monday = new Date(start.getFullYear(), start.getMonth(), start.getDate() - weekday(start))
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const week = Math.floor(Math.round((day - monday) / 86400000) / 7) + (flip ? 1 : 0)
  const odd = Math.abs(week % 2) === 1
  const dow = weekday(day)
  const weekend = dow >= 5
  switch (rhythm) {
    case 'weeks':
      return odd ? 'B' : 'A'
    case '2-2-3': {
      // Mon-Tue one parent, Wed-Thu the other, Fri-Sun the first; swap each week.
      const first = odd ? 'B' : 'A'
      const second = odd ? 'A' : 'B'
      return dow <= 1 || dow >= 4 ? first : second
    }
    case 'weekend-mid':
      // A has the week; B has Wednesday and every other weekend.
      if (dow === 2) return 'B'
      if (weekend) return odd ? 'B' : 'A'
      return 'A'
    case 'mostly-A':
      return weekend && odd ? 'B' : 'A'
    case 'mostly-B':
      return weekend && odd ? 'A' : 'B'
    default:
      return null
  }
}

// Fill empty calendar days for the next `weeks` weeks from `start`, counting
// the rhythm's weeks from `anchor`. Days already planned, and days in locked
// months, are left alone.
export function fillCustody(custody, rhythm, start, weeks = 12, locked = {}, anchor = start, flip = false) {
  const next = { ...custody }
  let added = 0
  if (!RHYTHMS.includes(rhythm) || rhythm === 'undecided') return { custody: next, added }
  for (let i = 0; i < weeks * 7; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const key = isoDate(date)
    if (next[key] || locked[key.slice(0, 7)]) continue
    const who = rhythmOwner(rhythm, date, anchor, flip)
    if (who) {
      next[key] = who
      added += 1
    }
  }
  return { custody: next, added }
}

// A rule is { rhythm, anchor: Date, flip: bool }. Moving from one rule to
// another rewrites the coming days that still follow the old rule (and empty
// days); days someone changed by hand, 'both' days and locked months stay.
// Used when a parent swaps the rhythm round or picks another one.
export function refillCustody(custody, from, to, start, weeks = 12, locked = {}) {
  const next = { ...custody }
  let changed = 0
  if (!to || !RHYTHMS.includes(to.rhythm) || to.rhythm === 'undecided') return { custody: next, changed }
  for (let i = 0; i < weeks * 7; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const key = isoDate(date)
    if (locked[key.slice(0, 7)]) continue
    const now = next[key]
    const old = from && from.rhythm ? rhythmOwner(from.rhythm, date, from.anchor, from.flip) : null
    if (now && now !== old) continue
    const who = rhythmOwner(to.rhythm, date, to.anchor, to.flip)
    if (who && who !== now) {
      next[key] = who
      changed += 1
    }
  }
  return { custody: next, changed }
}

// The rule a saved family follows, or null when it has no rhythm yet.
export function familyRule(family) {
  const rhythm = family?.custody?.rhythm
  if (!rhythm || rhythm === 'undecided' || !RHYTHMS.includes(rhythm)) return null
  const saved = family.rhythmFrom
  if (!saved || saved.rhythm !== rhythm || !/^\d{4}-\d{2}-\d{2}$/.test(saved.date || '')) return null
  const [y, m, d] = saved.date.split('-').map(Number)
  return { rhythm, anchor: new Date(y, m - 1, d), flip: family.custody.flip === 'yes' }
}

// The date weeks are counted from for a rhythm. Kept once the calendar is
// filled, so filling more days later stays in step with the days already set.
export function rhythmAnchor(family, rhythm, today) {
  const saved = family?.rhythmFrom
  if (saved && saved.rhythm === rhythm && /^\d{4}-\d{2}-\d{2}$/.test(saved.date || '')) {
    const [y, m, d] = saved.date.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(today.getFullYear(), today.getMonth(), today.getDate())
}

export function anchorRecord(rhythm, date) {
  return { rhythm, date: isoDate(date) }
}

export function activitiesOn(family, date) {
  const dow = weekday(date)
  return (family?.activities || [])
    .filter((item) => item.name && Number(item.day) === dow)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)))
}

// Short list of what changed, for the activity feed when a parent edits.
export function describeChanges(before, after) {
  if (!before) return []
  const changes = []
  const json = (value) => JSON.stringify(value)
  if (json(before.parents) !== json(after.parents)) changes.push('names')
  const strip = (list) => list.map(({ health, ...rest }) => rest)
  if (json(strip(before.children)) !== json(strip(after.children))) changes.push('children')
  if (json(before.children.map((c) => c.health)) !== json(after.children.map((c) => c.health))) changes.push('health')
  if (json(before.activities) !== json(after.activities)) changes.push('activities')
  if (json(before.custody) !== json(after.custody)) changes.push('custody')
  return changes
}

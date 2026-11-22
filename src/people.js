// Who is who in the plan: the names shown on every screen, and which parent
// this phone speaks for.

// Names an older version filled in on its own. They are never real names.
const DEMO = { nameA: 'Alex', nameB: 'Sam', child: 'Noa' }

const FALLBACK = {
  en: { A: 'Parent A', B: 'Parent B', child: 'Your child' },
  fr: { A: 'Parent A', B: 'Parent B', child: 'Votre enfant' },
  de: { A: 'Elternteil A', B: 'Elternteil B', child: 'Euer Kind' },
  lb: { A: 'Elterendeel A', B: 'Elterendeel B', child: 'Äert Kand' },
}

function readProfile() {
  try {
    const raw = localStorage.getItem('cp-profile')
    return raw ? JSON.parse(raw) || {} : {}
  } catch {
    return {}
  }
}

export function realName(value, key) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text && text !== DEMO[key] ? text : ''
}

export function fallbackNames(lang) {
  const code = lang || (typeof document !== 'undefined' ? document.documentElement.lang : 'en')
  return FALLBACK[code] || FALLBACK.en
}

// The names to show. A name nobody typed shows as "Parent A" or "Your child".
export function names(lang) {
  const profile = readProfile()
  const fallback = fallbackNames(lang)
  return {
    A: realName(profile.nameA, 'nameA') || fallback.A,
    B: realName(profile.nameB, 'nameB') || fallback.B,
    child: realName(profile.child, 'child') || fallback.child,
  }
}

// The side this phone speaks for once it is in a shared plan: 'A' or 'B'.
// null before sign-in, when the app is only being tried out on this phone.
export function sharedRole() {
  try {
    if (!localStorage.getItem('cp-code')) return null
    const role = localStorage.getItem('cp-role')
    return role === 'A' || role === 'B' ? role : null
  } catch {
    return null
  }
}

// Monday-first weekday letters for the small calendars.
const WEEKDAYS = {
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  fr: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
  de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
  lb: ['Mé', 'Dë', 'Më', 'Do', 'Fr', 'Sa', 'So'],
}
export function weekdayLetters(lang) {
  return WEEKDAYS[String(lang || 'en').toLowerCase()] || WEEKDAYS.en
}

// Up to five letters for a calendar cell: the typed name, or just A / B.
export function shortName(role) {
  const profile = readProfile()
  const name = realName(profile[role === 'B' ? 'nameB' : 'nameA'], role === 'B' ? 'nameB' : 'nameA')
  return name ? name.slice(0, 5) : role
}

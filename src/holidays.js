// Luxembourg school holidays (public schools) and how parents share them.
// Dates: men.public.lu/fr/vacances-scolaires.html for 2026/2027 and 2027/2028.
// 2025/2026 from the règlement grand-ducal of 18 July 2025 as listed by FEDIL.
// Add the next school year here when the ministry publishes it.

export const SCHOOL_PERIODS = [
  { name: 'Carnival', start: '2026-02-14', end: '2026-02-22', schoolYear: 2025 },
  { name: 'Easter', start: '2026-03-28', end: '2026-04-12', schoolYear: 2025 },
  { name: 'Pentecost', start: '2026-05-23', end: '2026-05-31', schoolYear: 2025 },
  { name: 'Summer', start: '2026-07-16', end: '2026-09-14', schoolYear: 2025 },

  { name: 'All Saints', start: '2026-10-31', end: '2026-11-08', schoolYear: 2026 },
  { name: 'Christmas', start: '2026-12-19', end: '2027-01-03', schoolYear: 2026 },
  { name: 'Carnival', start: '2027-02-06', end: '2027-02-14', schoolYear: 2026 },
  { name: 'Easter', start: '2027-03-27', end: '2027-04-11', schoolYear: 2026 },
  { name: 'Pentecost', start: '2027-05-29', end: '2027-06-06', schoolYear: 2026 },
  { name: 'Summer', start: '2027-07-16', end: '2027-09-14', schoolYear: 2026 },

  { name: 'All Saints', start: '2027-10-30', end: '2027-11-07', schoolYear: 2027 },
  { name: 'Christmas', start: '2027-12-18', end: '2028-01-02', schoolYear: 2027 },
  { name: 'Carnival', start: '2028-02-12', end: '2028-02-20', schoolYear: 2027 },
  { name: 'Easter', start: '2028-04-01', end: '2028-04-16', schoolYear: 2027 },
  { name: 'Pentecost', start: '2028-05-27', end: '2028-06-04', schoolYear: 2027 },
  { name: 'Summer', start: '2028-07-14', end: '2028-09-14', schoolYear: 2027 },
]

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysInRange(start, end) {
  const out = []
  const d = new Date(start + 'T12:00:00')
  const last = new Date(end + 'T12:00:00')
  while (d <= last) {
    out.push(iso(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

// { '2026-11-02': 'All Saints', ... } for one calendar year.
export function schoolHolidayMap(year) {
  const map = {}
  for (const p of SCHOOL_PERIODS) {
    for (const day of daysInRange(p.start, p.end)) {
      if (day.startsWith(String(year))) map[day] = p.name
    }
  }
  return map
}

// The school year a month belongs to: from September it is the new one.
export function schoolYearOf(year, month) {
  return month >= 8 ? year : year - 1
}

export const HOLIDAY_MODES = ['halves', 'alternate', 'rhythm']

// Who has each school holiday day.
// halves: one parent has the first half of every holiday, the other the second half.
// alternate: whole holidays go A, B, A, B through the school year.
// rhythm: holidays are not special, the usual rhythm decides (returns nothing).
// `first` is the parent with the first holiday (or first half) of `refYear`'s school year.
// Each school year after or before it swaps, so nobody always has the same holidays.
export function holidayOwners(mode, first, refYear) {
  const out = {}
  if (mode !== 'halves' && mode !== 'alternate') return out
  const other = first === 'A' ? 'B' : 'A'
  const index = {}
  for (const p of SCHOOL_PERIODS) {
    const i = index[p.schoolYear] = (index[p.schoolYear] ?? -1) + 1
    const swap = Math.abs(p.schoolYear - refYear) % 2 === 1
    const lead = swap ? other : first
    const trail = lead === 'A' ? 'B' : 'A'
    const days = daysInRange(p.start, p.end)
    if (mode === 'alternate') {
      const who = i % 2 === 0 ? lead : trail
      for (const day of days) out[day] = who
    } else {
      const half = Math.ceil(days.length / 2)
      days.forEach((day, k) => { out[day] = k < half ? lead : trail })
    }
  }
  return out
}

// The first holiday of a school year, to ask "who has it?".
export function firstPeriod(schoolYear) {
  return SCHOOL_PERIODS.find((p) => p.schoolYear === schoolYear) || null
}

// Expenses and payments: plain logic, no React, so it can be tested.
//
// Stored in the shared plan:
//   cp-expenses  [{ id, desc, amount, paidBy: 'A'|'B'|'account', split: '50'|'A'|'B',
//                  date: 'YYYY-MM-DD', category, settled, settledAt }]
//   cp-payments  [{ id, kind: 'deposit'|'support', who: 'A'|'B', amount, date, note }]
//   cp-money     { mode: 'shared'|'own'|'support', monthly: { A, B }, support: { payer, amount }, budget: { [category]: amount } }

export const CATEGORIES = ['food', 'clothes', 'school', 'activities', 'health', 'holidays', 'other']
export const MODES = ['shared', 'own', 'support']

export function isoDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function monthOf(date) {
  return String(date || '').slice(0, 7)
}

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
}
export const toAmount = num

// Expenses saved before dates and categories existed: the id is the time they were added.
export function normalizeExpense(it) {
  const amount = num(it.amount)
  const fromId = typeof it.id === 'number' && it.id > 1e12 ? isoDay(new Date(it.id)) : isoDay()
  return {
    ...it,
    amount,
    paidBy: ['A', 'B', 'account'].includes(it.paidBy) ? it.paidBy : 'A',
    split: ['50', 'A', 'B'].includes(it.split) ? it.split : '50',
    date: /^\d{4}-\d{2}-\d{2}$/.test(it.date || '') ? it.date : fromId,
    category: CATEGORIES.includes(it.category) ? it.category : 'other',
  }
}

export function normalizeMoney(m) {
  const v = m && typeof m === 'object' ? m : {}
  const budget = {}
  for (const c of CATEGORIES) if (num(v.budget?.[c])) budget[c] = num(v.budget[c])
  return {
    mode: MODES.includes(v.mode) ? v.mode : null,
    monthly: { A: num(v.monthly?.A), B: num(v.monthly?.B) },
    support: { payer: v.support?.payer === 'B' ? 'B' : 'A', amount: num(v.support?.amount) },
    budget,
  }
}

// What each parent is owed (+) or owes (-), from costs not yet settled.
// Costs paid from the shared account are nobody's debt.
export function balance(expenses) {
  let a = 0
  for (const raw of expenses) {
    const it = normalizeExpense(raw)
    if (it.settled || it.paidBy === 'account') continue
    const shareA = it.split === '50' ? it.amount / 2 : it.split === 'A' ? it.amount : 0
    const shareB = it.amount - shareA
    if (it.paidBy === 'A') a += shareB
    else a -= shareA
  }
  const round = (x) => (Math.abs(x) < 0.005 ? 0 : Math.round(x * 100) / 100)
  return { a: round(a), b: round(-a) }
}

// Spending per category in one month, against the agreed budget.
export function monthSummary(expenses, month, budget = {}) {
  const spent = Object.fromEntries(CATEGORIES.map((c) => [c, 0]))
  for (const raw of expenses) {
    const it = normalizeExpense(raw)
    if (monthOf(it.date) === month) spent[it.category] += it.amount
  }
  const rows = CATEGORIES.map((c) => {
    const s = Math.round(spent[c] * 100) / 100
    const b = num(budget[c])
    return { category: c, spent: s, budget: b, over: b > 0 && s > b }
  })
  const total = Math.round(rows.reduce((t, r) => t + r.spent, 0) * 100) / 100
  const totalBudget = rows.reduce((t, r) => t + r.budget, 0)
  return { rows, total, totalBudget }
}

// The last `count` months, newest first: ['2026-11', '2026-10', ...].
export function recentMonths(today, count) {
  const [y, m] = monthOf(today).split('-').map(Number)
  const out = []
  for (let i = 0; i < count; i++) {
    const d = new Date(y, m - 1 - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + by, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Payment history month by month, for the people who pay.
// Each cell: what was recorded, on which dates, and the agreed amount.
// Nothing recorded is just that: "not recorded yet", never "late".
export function paymentHistory(payments, kind, payers, agreed, months) {
  return months.map((month) => ({
    month,
    cells: payers.map((who) => {
      const mine = payments
        .filter((p) => p.kind === kind && p.who === who && monthOf(p.date) === month)
        .sort((x, y) => x.date.localeCompare(y.date))
      const paid = Math.round(mine.reduce((t, p) => t + num(p.amount), 0) * 100) / 100
      const due = num(agreed[who])
      return { who, paid, due, dates: mine.map((p) => p.date), recorded: mine.length > 0, short: due > 0 && mine.length > 0 && paid < due }
    }),
  }))
}

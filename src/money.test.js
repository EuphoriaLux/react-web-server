import { test } from 'node:test'
import assert from 'node:assert/strict'
import { balance, monthSummary, normalizeExpense, normalizeMoney, paymentHistory, recentMonths, shiftMonth } from './money.js'

test('old expenses get a date from their id and a category', () => {
  const it = normalizeExpense({ id: new Date(2026, 10, 3, 10).getTime(), desc: 'Shoes', amount: '40', paidBy: 'A', split: '50' })
  assert.equal(it.date, '2026-11-03')
  assert.equal(it.category, 'other')
  assert.equal(it.amount, 40)
})

test('balance ignores settled costs and the shared account', () => {
  const b = balance([
    { id: 1, amount: 100, paidBy: 'A', split: '50', date: '2026-11-01' },
    { id: 2, amount: 30, paidBy: 'B', split: 'A', date: '2026-11-01' },
    { id: 3, amount: 80, paidBy: 'A', split: '50', settled: true, date: '2026-11-01' },
    { id: 4, amount: 500, paidBy: 'account', split: '50', date: '2026-11-01' },
  ])
  assert.deepEqual(b, { a: 20, b: -20 })
})

test('monthly summary shows spending against the agreed budget', () => {
  const s = monthSummary([
    { id: 1, amount: 120, category: 'food', date: '2026-11-02' },
    { id: 2, amount: 50, category: 'food', date: '2026-11-20' },
    { id: 3, amount: 70, category: 'school', date: '2026-10-30' },
  ], '2026-11', { food: 150 })
  const food = s.rows.find((r) => r.category === 'food')
  assert.equal(food.spent, 170)
  assert.equal(food.over, true)
  assert.equal(s.rows.find((r) => r.category === 'school').spent, 0)
  assert.equal(s.total, 170)
})

test('payment history lists dates and leaves empty months neutral', () => {
  const h = paymentHistory([
    { kind: 'support', who: 'A', amount: 300, date: '2026-11-05' },
    { kind: 'support', who: 'A', amount: 100, date: '2026-11-20' },
    { kind: 'deposit', who: 'A', amount: 999, date: '2026-11-01' },
  ], 'support', ['A'], { A: 450 }, ['2026-11', '2026-10'])
  assert.deepEqual(h[0].cells[0], { who: 'A', paid: 400, due: 450, dates: ['2026-11-05', '2026-11-20'], recorded: true, short: true })
  assert.equal(h[1].cells[0].recorded, false)
})

test('months and settings', () => {
  assert.deepEqual(recentMonths('2026-01-15', 3), ['2026-01', '2025-12', '2025-11'])
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(normalizeMoney({ mode: 'x' }).mode, null)
  assert.deepEqual(normalizeMoney({ budget: { food: '200', bad: 5 } }).budget, { food: 200 })
})

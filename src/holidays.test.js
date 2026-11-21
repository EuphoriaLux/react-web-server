import { test } from 'node:test'
import assert from 'node:assert/strict'
import { holidayOwners, schoolHolidayMap, schoolYearOf, firstPeriod } from './holidays.js'

test('school holiday days are listed per calendar year', () => {
  const y2027 = schoolHolidayMap(2027)
  assert.equal(y2027['2027-01-03'], 'Christmas')
  assert.equal(y2027['2027-07-16'], 'Summer')
  assert.equal(y2027['2027-11-07'], 'All Saints')
  assert.equal(y2027['2027-09-15'], undefined)
})

test('alternate gives whole holidays A, B, A, B and swaps next school year', () => {
  const o = holidayOwners('alternate', 'A', 2026)
  assert.equal(o['2026-11-01'], 'A') // All Saints 2026
  assert.equal(o['2026-12-25'], 'B') // Christmas 2026
  assert.equal(o['2027-01-03'], 'B')
  assert.equal(o['2027-02-10'], 'A') // Carnival
  assert.equal(o['2027-08-01'], 'B') // Summer 2027
  assert.equal(o['2027-11-01'], 'B') // All Saints 2027 swaps
  assert.equal(o['2027-12-25'], 'A') // Christmas 2027 swaps
})

test('halves give the first half to one parent and swap next school year', () => {
  const o = holidayOwners('halves', 'B', 2026)
  assert.equal(o['2026-12-19'], 'B')
  assert.equal(o['2027-01-03'], 'A')
  assert.equal(o['2027-07-16'], 'B')
  assert.equal(o['2027-09-14'], 'A')
  assert.equal(o['2027-12-18'], 'A') // next school year: A starts
  const summer = Object.entries(o).filter(([d]) => d >= '2027-07-16' && d <= '2027-09-14')
  const a = summer.filter(([, w]) => w === 'A').length
  const b = summer.filter(([, w]) => w === 'B').length
  assert.ok(Math.abs(a - b) <= 1)
})

test('keeping the usual rhythm assigns no holiday days', () => {
  assert.deepEqual(holidayOwners('rhythm', 'A', 2026), {})
})

test('school year starts in September', () => {
  assert.equal(schoolYearOf(2026, 8), 2026)
  assert.equal(schoolYearOf(2027, 0), 2026)
  assert.equal(firstPeriod(2026).name, 'All Saints')
})

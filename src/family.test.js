import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyFamily, familyFromProfile, normalizeFamily, childrenLabel, profileFromFamily, canFinish,
  cleanFamily, rhythmOwner, fillCustody, activitiesOn, describeChanges, emptyChild, rhythmAnchor, anchorRecord,
} from './family.js'

test('old profile names carry over, demo names do not', () => {
  const real = familyFromProfile({ nameA: 'Tom', nameB: 'Sam', child: 'Lina' })
  assert.equal(real.parents.A.name, 'Tom')
  assert.equal(real.parents.B.name, '')
  assert.equal(real.children[0].name, 'Lina')
  assert.equal(familyFromProfile(null).children.length, 1)
})

test('normalize fills missing parts of a saved family', () => {
  const family = normalizeFamily({ children: [{ name: 'Lina' }], custody: { rhythm: 'weeks' } })
  assert.equal(family.children[0].care, '')
  assert.equal(family.custody.rhythm, 'weeks')
  assert.equal(family.custody.ruling, '')
  assert.deepEqual(family.confirmed, { A: false, B: false })
  assert.equal(normalizeFamily(null), null)
})

test('children label joins names for the rest of the app', () => {
  const family = emptyFamily()
  assert.equal(childrenLabel(family), '')
  family.children = [{ ...emptyChild(), name: 'Lina' }, { ...emptyChild(), name: 'Max' }, { ...emptyChild(), name: 'Zoé' }]
  assert.equal(childrenLabel(family), 'Lina, Max & Zoé')
  family.parents.A.name = 'Tom'
  assert.deepEqual(profileFromFamily(family, { nameA: 'Alex', nameB: 'Sam', child: 'Noa' }), { nameA: 'Tom', nameB: '', child: 'Lina, Max & Zoé' })
  assert.deepEqual(profileFromFamily(family, { nameB: 'Mia' }).nameB, 'Mia')
})

test('finishing needs your own name and one child', () => {
  const family = emptyFamily()
  family.parents.A.name = 'Tom'
  assert.equal(canFinish(family, 'A'), false)
  family.children[0].name = 'Lina'
  assert.equal(canFinish(family, 'A'), true)
  assert.equal(canFinish(family, 'B'), false)
})

test('clean drops blank children and activities, and reattaches orphaned activities', () => {
  const family = emptyFamily()
  const kept = { ...emptyChild(), name: ' Lina ' }
  family.children = [kept, emptyChild()]
  family.activities = [
    { id: '1', childId: 'gone', name: 'Judo', day: 2, time: '17:00', who: 'A' },
    { id: '2', childId: kept.id, name: '  ', day: 1, time: '', who: '' },
  ]
  const clean = cleanFamily(family)
  assert.equal(clean.children.length, 1)
  assert.equal(clean.children[0].name, 'Lina')
  assert.equal(clean.activities.length, 1)
  assert.equal(clean.activities[0].childId, 'all')
})

test('rhythms give the expected parent', () => {
  const monday = new Date(2026, 10, 23)
  const day = (n) => new Date(2026, 10, 23 + n)
  assert.equal(rhythmOwner('weeks', day(0), monday), 'A')
  assert.equal(rhythmOwner('weeks', day(7), monday), 'B')
  // 2-2-3: Mon A, Wed B, Sat A, then next Mon B
  assert.deepEqual([0, 2, 5, 7, 9].map((n) => rhythmOwner('2-2-3', day(n), monday)), ['A', 'B', 'A', 'B', 'A'])
  // every other weekend + Wednesday
  assert.deepEqual([1, 2, 5, 12].map((n) => rhythmOwner('weekend-mid', day(n), monday)), ['A', 'B', 'A', 'B'])
  assert.deepEqual([5, 12, 3].map((n) => rhythmOwner('mostly-B', day(n), monday)), ['B', 'A', 'B'])
  assert.equal(rhythmOwner('undecided', day(0), monday), null)
})

test('weeks count from the start week even when starting mid-week', () => {
  const thursday = new Date(2026, 10, 26)
  assert.equal(rhythmOwner('weeks', thursday, thursday), 'A')
  assert.equal(rhythmOwner('weeks', new Date(2026, 10, 30), thursday), 'B')
})

test('filling the calendar keeps planned days and locked months', () => {
  const start = new Date(2026, 10, 23)
  const { custody, added } = fillCustody({ '2026-11-23': 'B' }, 'weeks', start, 2, { '2026-12': true })
  assert.equal(custody['2026-11-23'], 'B')
  assert.equal(custody['2026-11-24'], 'A')
  assert.equal(custody['2026-11-30'], 'B')
  assert.equal(custody['2026-12-01'], undefined)
  assert.equal(added, 7)
  assert.equal(fillCustody({}, 'undecided', start).added, 0)
})

test('activities show on their weekday, sorted by time', () => {
  const family = emptyFamily()
  family.activities = [
    { id: '1', childId: 'all', name: 'Swim', day: 2, time: '18:00', who: '' },
    { id: '2', childId: 'all', name: 'Music', day: 2, time: '14:00', who: '' },
    { id: '3', childId: 'all', name: 'Judo', day: 4, time: '17:00', who: '' },
  ]
  assert.deepEqual(activitiesOn(family, new Date(2026, 10, 25)).map((a) => a.name), ['Music', 'Swim'])
})

test('changes are described for the activity feed', () => {
  const before = emptyFamily()
  const after = structuredClone(before)
  after.children[0].health = 'Peanut allergy'
  after.custody.rhythm = 'weeks'
  assert.deepEqual(describeChanges(before, after), ['health', 'custody'])
  assert.deepEqual(describeChanges(null, after), [])
})

test('a later fill stays in step with the first one', () => {
  const first = new Date(2026, 10, 23)
  const family = { rhythmFrom: anchorRecord('weeks', first) }
  const later = new Date(2026, 10, 30)
  const anchor = rhythmAnchor(family, 'weeks', later)
  assert.equal(anchor.getTime(), first.getTime())
  const { custody } = fillCustody({}, 'weeks', later, 12, {}, anchor)
  // Weeks of Feb 8 and Feb 15 2027 alternate, counted from Nov 23 (A).
  assert.equal(custody['2027-02-08'], 'B')
  assert.equal(custody['2027-02-15'], 'A')
  assert.equal(custody['2026-11-23'], undefined)
  // A new rhythm starts counting again from today.
  assert.equal(rhythmAnchor(family, '2-2-3', later).getTime(), later.getTime())
})

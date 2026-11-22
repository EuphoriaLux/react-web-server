import { test } from 'node:test'
import assert from 'node:assert/strict'
import { realName, fallbackNames, weekdayLetters, sharedRole } from './people.js'

test('demo names never count as real names', () => {
  assert.equal(realName('Alex', 'nameA'), '')
  assert.equal(realName('Noa', 'child'), '')
  assert.equal(realName(' Tom ', 'nameA'), 'Tom')
  assert.equal(realName(undefined, 'nameB'), '')
})

test('unnamed people show in the chosen language', () => {
  assert.equal(fallbackNames('fr').child, 'Votre enfant')
  assert.equal(fallbackNames('de').A, 'Elternteil A')
  assert.equal(fallbackNames('xx').B, 'Parent B')
})

test('weekday letters follow the language', () => {
  assert.deepEqual(weekdayLetters('LB'), ['Mé', 'Dë', 'Më', 'Do', 'Fr', 'Sa', 'So'])
  assert.equal(weekdayLetters('fr')[0], 'L')
})

test('no shared side without a plan on this phone', () => {
  assert.equal(sharedRole(), null)
})

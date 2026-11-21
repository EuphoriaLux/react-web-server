import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickLang } from './lang.js'

test('a French phone opens in French', () => {
  assert.equal(pickLang(null, false, ['fr-LU', 'en']), 'fr')
  assert.equal(pickLang(null, false, ['de-DE']), 'de')
  assert.equal(pickLang(null, false, ['pt-PT', 'fr-FR']), 'fr')
  assert.equal(pickLang(null, false, ['pt-PT']), 'en')
})

test('the old automatic English does not stick', () => {
  assert.equal(pickLang('en', false, ['fr-FR']), 'fr')
})

test('a language picked on the switch wins', () => {
  assert.equal(pickLang('en', true, ['fr-FR']), 'en')
  assert.equal(pickLang('lb', false, ['fr-FR']), 'lb')
  assert.equal(pickLang('xx', true, ['de']), 'de')
})

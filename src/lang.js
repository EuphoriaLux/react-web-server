// Which language the app opens in.

export const LANGS = ['en', 'fr', 'de', 'lb']
// The phone's language, unless this person picked one on the switch.
// Before this, the app saved 'en' for everyone on first visit, so a saved 'en'
// without the chosen mark is not a real choice.
export function pickLang(saved, chosen, phoneLangs) {
  if (LANGS.includes(saved) && (chosen || saved !== 'en')) return saved
  for (const tag of phoneLangs || []) {
    const base = String(tag).toLowerCase().split('-')[0]
    if (LANGS.includes(base)) return base
  }
  return 'en'
}

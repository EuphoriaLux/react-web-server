import React, { useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { useLang } from './main.jsx'
import { PrivacyLink } from './privacy.jsx'

// The beta waitlist on the landing page, in the app's four languages.
export const BETA_COPY = {
  en: {
    label: 'Private beta', join: 'Join the beta', signIn: 'Sign in', invited: 'Already invited? Sign in',
    title: 'Try CoParents with your family',
    lead: 'We are opening CoParents to a few families in Luxembourg first. Leave your email and we will send you an invitation.',
    email: 'Email', firstName: 'First name (optional)', children: 'Children', care: 'How is care shared today?',
    other: 'Would the other parent use it too?', choose: 'Choose',
    careOptions: { alternating: 'About half each', 'mostly-me': 'Mostly with me', 'mostly-other': 'Mostly with the other parent', other: 'Something else' },
    otherOptions: { yes: 'Yes, probably', unsure: 'Not sure yet', no: 'Probably not' },
    consent: 'You may email me about the beta. I can ask to be removed at any time.',
    send: 'Join the waitlist', sending: 'Sending…',
    thanks: 'Thank you. You are on the list. We will email {email} when your invitation is ready.',
    errors: {
      'enter a valid email address': 'Enter a valid email address.',
      'please agree to be contacted about the beta': 'Please tick the box so we may contact you.',
      'too many attempts. Try again later.': 'Too many attempts. Try again later.',
    },
    failed: 'That did not work. Try again in a moment.',
  },
  fr: {
    label: 'Bêta privée', join: 'Rejoindre la bêta', signIn: 'Se connecter', invited: 'Déjà invité ? Se connecter',
    title: 'Essayez CoParents en famille',
    lead: 'Nous ouvrons d’abord CoParents à quelques familles au Luxembourg. Laissez votre e-mail et nous vous enverrons une invitation.',
    email: 'E-mail', firstName: 'Prénom (facultatif)', children: 'Enfants', care: 'Comment la garde est-elle partagée aujourd’hui ?',
    other: 'L’autre parent l’utiliserait-il aussi ?', choose: 'Choisir',
    careOptions: { alternating: 'À peu près moitié-moitié', 'mostly-me': 'Surtout chez moi', 'mostly-other': 'Surtout chez l’autre parent', other: 'Autre chose' },
    otherOptions: { yes: 'Oui, probablement', unsure: 'Je ne sais pas encore', no: 'Probablement pas' },
    consent: 'Vous pouvez m’écrire au sujet de la bêta. Je peux demander à être retiré à tout moment.',
    send: 'M’inscrire sur la liste', sending: 'Envoi…',
    thanks: 'Merci, vous êtes sur la liste. Nous écrirons à {email} quand votre invitation sera prête.',
    errors: {
      'enter a valid email address': 'Saisissez une adresse e-mail valide.',
      'please agree to be contacted about the beta': 'Cochez la case pour que nous puissions vous contacter.',
      'too many attempts. Try again later.': 'Trop de tentatives. Réessayez plus tard.',
    },
    failed: 'Cela n’a pas marché. Réessayez dans un instant.',
  },
  de: {
    label: 'Private Beta', join: 'Bei der Beta mitmachen', signIn: 'Anmelden', invited: 'Schon eingeladen? Anmelden',
    title: 'Probiert CoParents als Familie aus',
    lead: 'Wir öffnen CoParents zuerst für einige Familien in Luxemburg. Hinterlasst eure E-Mail, und wir schicken euch eine Einladung.',
    email: 'E-Mail', firstName: 'Vorname (freiwillig)', children: 'Kinder', care: 'Wie ist die Betreuung heute geteilt?',
    other: 'Würde der andere Elternteil auch mitmachen?', choose: 'Auswählen',
    careOptions: { alternating: 'Ungefähr halb-halb', 'mostly-me': 'Meist bei mir', 'mostly-other': 'Meist beim anderen Elternteil', other: 'Anders' },
    otherOptions: { yes: 'Ja, wahrscheinlich', unsure: 'Noch nicht sicher', no: 'Eher nicht' },
    consent: 'Ihr dürft mir wegen der Beta schreiben. Ich kann jederzeit verlangen, entfernt zu werden.',
    send: 'Auf die Warteliste', sending: 'Wird gesendet…',
    thanks: 'Danke, ihr steht auf der Liste. Wir schreiben an {email}, sobald eure Einladung bereit ist.',
    errors: {
      'enter a valid email address': 'Gebt eine gültige E-Mail-Adresse ein.',
      'please agree to be contacted about the beta': 'Setzt bitte das Häkchen, damit wir euch schreiben dürfen.',
      'too many attempts. Try again later.': 'Zu viele Versuche. Bitte später noch einmal.',
    },
    failed: 'Das hat nicht geklappt. Versucht es gleich noch einmal.',
  },
  lb: {
    label: 'Privat Beta', join: 'Bei der Beta matmaachen', signIn: 'Umellen', invited: 'Scho invitéiert? Umellen',
    title: 'Probéiert CoParents als Famill aus',
    lead: 'Mir maachen CoParents fir d’éischt fir e puer Familljen zu Lëtzebuerg op. Loosst eis Är E-Mail do, a mir schécken Iech eng Invitatioun.',
    email: 'E-Mail', firstName: 'Virnumm (fräiwëlleg)', children: 'Kanner', care: 'Wéi ass d’Betreiung haut gedeelt?',
    other: 'Géif deen aneren Elterendeel och matmaachen?', choose: 'Auswielen',
    careOptions: { alternating: 'Ongeféier hallef-hallef', 'mostly-me': 'Meeschtens bei mir', 'mostly-other': 'Meeschtens beim aneren Elterendeel', other: 'Anescht' },
    otherOptions: { yes: 'Jo, wahrscheinlech', unsure: 'Nach net sécher', no: 'Éischter net' },
    consent: 'Dir dierft mir wéinst der Beta schreiwen. Ech kann all Moment froen, ewechgeholl ze ginn.',
    send: 'Op d’Waardelëscht', sending: 'Gëtt geschéckt…',
    thanks: 'Merci, Dir sidd op der Lëscht. Mir schreiwen un {email}, soubal Är Invitatioun prett ass.',
    errors: {
      'enter a valid email address': 'Gitt eng gëlteg E-Mail-Adress an.',
      'please agree to be contacted about the beta': 'Setzt w.e.g. den Hokit, fir datt mir Iech schreiwen dierfen.',
      'too many attempts. Try again later.': 'Ze vill Versich. Probéiert méi spéit nach eng Kéier.',
    },
    failed: 'Dat huet net geklappt. Probéiert gläich nach eng Kéier.',
  },
}

export function useBetaCopy() {
  const { lang } = useLang()
  return BETA_COPY[lang] || BETA_COPY.en
}

export function BetaForm({ onSignIn }) {
  const { lang } = useLang()
  const c = useBetaCopy()
  const [form, setForm] = useState({ email: '', first_name: '', children: '', care: '', other_parent: '', consent: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value })

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/beta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, email: form.email.trim(), lang }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || '')
      setDone(form.email.trim())
    } catch (failure) {
      setError(c.errors[failure.message] || c.failed)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="beta-done" role="status">
        <span className="value-check"><Check size={16} /></span>
        <p>{c.thanks.replace('{email}', done)}</p>
      </div>
    )
  }
  return (
    <form className="beta-form" onSubmit={submit}>
      <label>{c.email}
        <input type="email" required autoComplete="email" inputMode="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
      </label>
      <label>{c.firstName}
        <input autoComplete="given-name" maxLength={60} value={form.first_name} onChange={set('first_name')} />
      </label>
      <div className="beta-row">
        <label>{c.children}
          <select value={form.children} onChange={set('children')}>
            <option value="">{c.choose}</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 5 ? '5+' : n}</option>)}
          </select>
        </label>
        <label>{c.care}
          <select value={form.care} onChange={set('care')}>
            <option value="">{c.choose}</option>
            {Object.entries(c.careOptions).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
          </select>
        </label>
      </div>
      <label>{c.other}
        <select value={form.other_parent} onChange={set('other_parent')}>
          <option value="">{c.choose}</option>
          {Object.entries(c.otherOptions).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </select>
      </label>
      <label className="beta-consent">
        <input type="checkbox" checked={form.consent} onChange={set('consent')} required />
        <span>{c.consent} <PrivacyLink /></span>
      </label>
      {error && <p className="beta-error" role="alert">{error}</p>}
      <button className="btn primary large light" type="submit" disabled={busy}>{busy ? c.sending : c.send}<ArrowRight size={18} /></button>
      <button className="btn text" type="button" onClick={onSignIn}>{c.invited}</button>
    </form>
  )
}

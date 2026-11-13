import React, { useEffect, useMemo, useState } from 'react'
import { useLang } from './main.jsx'

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}
function isoDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
const COPY = {
  en: {
    today: 'Today', resolve: 'Resolve', with: 'is with', open: 'Today is not planned yet',
    next: 'Next handover', none: 'No change in the next six weeks.',
    handTitle: 'Handover', handKicker: 'The next change', handEmpty: 'No handover in the next six weeks. Paint the calendar so you both know the next change.',
    from: 'From', to: 'To', time: 'Time', place: 'Place', bring: 'Bring',
    addItem: 'Add an item', confirm: 'I will be there', confirmed: 'Confirmed',
    waitingFor: 'Waiting for', bothReady: 'Both confirmed. Noa is expected.',
    youAre: 'You are', schoolGate: 'School gate',
    bag: 'School bag', coat: 'Coat', medicine: 'Medicine', sport: 'Sports kit', comfort: 'Comfort item',
    ask: 'Ask for a day', need: 'Day you need', offer: 'Day you can offer',
    needHint: 'Tap a day the other parent has.', offerHint: 'These are your days. Tap one to offer it.',
    offerDays: 'Days you can offer', askDays: 'Days you can ask for', noneMonth: 'None this month.',
    needShort: 'Need', offerShort: 'Offer', clear: 'Clear', request: 'Request', note: 'Short reason',
    openSwaps: 'Open requests', noSwaps: 'No open requests.', accept: 'Accept', decline: 'Decline',
    locked: 'That month is locked.', as: 'As',
    resolveLead: 'One topic, two views, one proposal. Agree only when you can live with it.',
    rulesTitle: 'House rules', rulesLead: 'These apply before a disagreement starts. Both parents agree once.',
    processTitle: 'How a disagreement is settled',
    r1: 'One topic at a time. Finish or pause it before opening another.',
    r2: 'Both views are written before anyone agrees.',
    r3: 'A proposal must be concrete: a time, a place, or an amount.',
    r4: 'Nothing is final until both say they can live with it.',
    r5: 'If it gets hot, pause. Come back the next day.',
    ruleNotice: '24 hours notice for a schedule change, unless the child is unwell.',
    ruleDaily: 'The parent who has the child decides the small daily things.',
    ruleBig: 'School, health, and money over €50 need both parents.',
    ruleFinal: 'No decision is final until both can live with it.',
    rulePause: 'If a note gets hot, pause. Do not decide the same day.',
    needBoth: 'Both views first', needProposal: 'Write a proposal first', paused: 'Paused',
    now: 'Now', waitingTopic: 'Waiting', agreeRule: 'I agree to this rule',
    raise: 'Raise a topic', topic: 'What is the disagreement about', view: 'Your view, in one calm paragraph',
    proposal: 'A proposal both could live with', pause: 'Pause', resume: 'Resume', live: 'I can live with this',
    waiting: 'Waiting for the other parent', agreed: 'You both agreed.', save: 'Save to papers', saved: 'Saved with the papers',
    cooling: 'Paused. Come back when you are both calm.', emptyIssues: 'No open topics.',
    handover: 'Handover', school: 'School', money: 'Money', health: 'Health', other: 'Other',
    write: 'Write a short note', send: 'Send', emptyMsg: 'Nothing in this thread yet.',
    heatTitle: 'This note sounds hot', heatLead: 'A calmer version is below. Edit it, or send the original if you still mean it.',
    calmer: 'Calmer version', sendCalm: 'Send the calmer note', sendAnyway: 'Send as written',
    papers: 'Papers', papersLead: 'Agreements and notes both of you can find.', emptyPapers: 'No papers yet.',
  },
  fr: {
    today: 'Aujourd’hui', resolve: 'Apaiser', with: 'est avec', open: 'Aujourd’hui n’est pas encore prévu',
    next: 'Prochain passage', none: 'Aucun changement dans les six semaines.',
    handTitle: 'Passage', handKicker: 'Le prochain changement', handEmpty: 'Aucun passage dans les six semaines. Colorez le calendrier pour que vous sachiez tous les deux.',
    from: 'De', to: 'Vers', time: 'Heure', place: 'Lieu', bring: 'À emporter',
    addItem: 'Ajouter', confirm: 'Je serai là', confirmed: 'Confirmé',
    waitingFor: 'En attente de', bothReady: 'Vous avez confirmé. Noa est attendu.',
    youAre: 'Vous êtes', schoolGate: 'Portail de l’école',
    bag: 'Cartable', coat: 'Manteau', medicine: 'Médicament', sport: 'Tenue de sport', comfort: 'Doudou',
    ask: 'Demander un jour', need: 'Jour dont vous avez besoin', offer: 'Jour que vous pouvez offrir',
    needHint: 'Touchez un jour de l’autre parent.', offerHint: 'Voici vos jours. Touchez-en un pour l’offrir.',
    offerDays: 'Jours que vous pouvez offrir', askDays: 'Jours que vous pouvez demander', noneMonth: 'Aucun ce mois-ci.',
    needShort: 'Besoin', offerShort: 'Offre', clear: 'Effacer', request: 'Demander', note: 'Raison courte',
    openSwaps: 'Demandes ouvertes', noSwaps: 'Aucune demande ouverte.', accept: 'Accepter', decline: 'Refuser',
    locked: 'Ce mois est verrouillé.', as: 'En tant que',
    resolveLead: 'Un sujet, deux points de vue, une proposition.',
    rulesTitle: 'Règles de la maison', rulesLead: 'Elles s’appliquent avant le désaccord. Les deux parents les acceptent une fois.',
    processTitle: 'Comment un désaccord se règle',
    r1: 'Un sujet à la fois. Terminez-le ou mettez-le en pause avant d’en ouvrir un autre.',
    r2: 'Les deux vues sont écrites avant tout accord.',
    r3: 'La proposition doit être concrète : une heure, un lieu ou un montant.',
    r4: 'Rien n’est final tant que les deux ne peuvent pas vivre avec.',
    r5: 'Si ça chauffe, pause. On revient le lendemain.',
    ruleNotice: '24 heures de préavis pour un changement, sauf si l’enfant est malade.',
    ruleDaily: 'Le parent qui a l’enfant décide des petites choses du quotidien.',
    ruleBig: 'École, santé et argent au-dessus de 50 € : les deux parents.',
    ruleFinal: 'Aucune décision n’est finale tant que les deux ne peuvent pas vivre avec.',
    rulePause: 'Si un message chauffe, pause. Pas de décision le jour même.',
    needBoth: 'Les deux vues d’abord', needProposal: 'Écrire une proposition', paused: 'En pause',
    now: 'En cours', waitingTopic: 'En attente', agreeRule: 'J’accepte cette règle',
    raise: 'Ouvrir un sujet', topic: 'De quoi s’agit-il', view: 'Votre vue, calmement',
    proposal: 'Une proposition acceptable', pause: 'Pause', resume: 'Reprendre', live: 'Je peux vivre avec ça',
    waiting: 'En attente de l’autre parent', agreed: 'Vous êtes d’accord.', save: 'Enregistrer dans les papiers', saved: 'Enregistré',
    cooling: 'En pause. Revenez quand vous serez calmes.', emptyIssues: 'Aucun sujet ouvert.',
    handover: 'Passage', school: 'École', money: 'Argent', health: 'Santé', other: 'Autre',
    write: 'Écrire une note courte', send: 'Envoyer', emptyMsg: 'Rien dans ce fil.',
    heatTitle: 'Ce message sonne dur', heatLead: 'Une version plus calme est ci-dessous.',
    calmer: 'Version plus calme', sendCalm: 'Envoyer la version calme', sendAnyway: 'Envoyer tel quel',
    papers: 'Papiers', papersLead: 'Accords et notes pour vous deux.', emptyPapers: 'Aucun document.',
  },
  de: {
    today: 'Heute', resolve: 'Klären', with: 'ist bei', open: 'Heute ist noch nicht geplant',
    next: 'Nächste Übergabe', none: 'Keine Änderung in den nächsten sechs Wochen.',
    handTitle: 'Übergabe', handKicker: 'Der nächste Wechsel', handEmpty: 'Keine Übergabe in den nächsten sechs Wochen. Malt den Kalender, damit ihr beide den nächsten Wechsel kennt.',
    from: 'Von', to: 'Zu', time: 'Uhrzeit', place: 'Ort', bring: 'Mitnehmen',
    addItem: 'Etwas hinzufügen', confirm: 'Ich bin da', confirmed: 'Bestätigt',
    waitingFor: 'Wartet auf', bothReady: 'Ihr habt bestätigt. Noa wird erwartet.',
    youAre: 'Du bist', schoolGate: 'Schultor',
    bag: 'Schultasche', coat: 'Jacke', medicine: 'Medizin', sport: 'Sportsachen', comfort: 'Kuscheltier',
    ask: 'Einen Tag bitten', need: 'Tag, den du brauchst', offer: 'Tag, den du anbieten kannst',
    needHint: 'Tippe einen Tag des anderen Elternteils.', offerHint: 'Das sind deine Tage. Tippe einen zum Anbieten.',
    offerDays: 'Tage, die du anbieten kannst', askDays: 'Tage, die du bitten kannst', noneMonth: 'Keine in diesem Monat.',
    needShort: 'Brauche', offerShort: 'Biete', clear: 'Löschen', request: 'Anfragen', note: 'Kurzer Grund',
    openSwaps: 'Offene Anfragen', noSwaps: 'Keine offenen Anfragen.', accept: 'Annehmen', decline: 'Ablehnen',
    locked: 'Dieser Monat ist gesperrt.', as: 'Als',
    resolveLead: 'Ein Thema, zwei Sichten, ein Vorschlag.',
    rulesTitle: 'Hausregeln', rulesLead: 'Sie gelten, bevor ein Streit beginnt. Beide Eltern stimmen einmal zu.',
    processTitle: 'Wie ein Streit geklärt wird',
    r1: 'Ein Thema nach dem anderen. Erst beenden oder pausieren.',
    r2: 'Beide Sichten stehen, bevor jemand zustimmt.',
    r3: 'Der Vorschlag muss konkret sein: Zeit, Ort oder Betrag.',
    r4: 'Nichts ist endgültig, bis beide damit leben können.',
    r5: 'Wenn es hitzig wird, Pause. Am nächsten Tag weiter.',
    ruleNotice: '24 Stunden Vorlauf für eine Planänderung, außer das Kind ist krank.',
    ruleDaily: 'Der Elternteil, der das Kind hat, entscheidet die kleinen Alltagssachen.',
    ruleBig: 'Schule, Gesundheit und Geld über 50 € brauchen beide.',
    ruleFinal: 'Keine Entscheidung ist endgültig, bis beide damit leben können.',
    rulePause: 'Wird eine Notiz hitzig, Pause. Nicht am selben Tag entscheiden.',
    needBoth: 'Erst beide Sichten', needProposal: 'Erst einen Vorschlag', paused: 'Pausiert',
    now: 'Jetzt', waitingTopic: 'Wartet', agreeRule: 'Ich stimme dieser Regel zu',
    raise: 'Thema öffnen', topic: 'Worum geht der Streit', view: 'Deine Sicht, ruhig',
    proposal: 'Ein Vorschlag für beide', pause: 'Pause', resume: 'Weiter', live: 'Damit kann ich leben',
    waiting: 'Wartet auf den anderen Elternteil', agreed: 'Ihr seid einig.', save: 'Bei den Papieren speichern', saved: 'Gespeichert',
    cooling: 'Pausiert. Kommt zurück, wenn ihr ruhig seid.', emptyIssues: 'Keine offenen Themen.',
    handover: 'Übergabe', school: 'Schule', money: 'Geld', health: 'Gesundheit', other: 'Anderes',
    write: 'Kurze Notiz', send: 'Senden', emptyMsg: 'Noch nichts in diesem Faden.',
    heatTitle: 'Diese Notiz klingt scharf', heatLead: 'Unten steht eine ruhigere Fassung.',
    calmer: 'Ruhigere Fassung', sendCalm: 'Die ruhige Notiz senden', sendAnyway: 'So senden',
    papers: 'Papiere', papersLead: 'Vereinbarungen, die ihr beide findet.', emptyPapers: 'Noch keine Dokumente.',
  },
  lb: {
    today: 'Haut', resolve: 'Klären', with: 'ass bei', open: 'Haut ass nach net geplangt',
    next: 'Nächst Iwwergab', none: 'Keng Ännerung an deenen nächste sechs Wochen.',
    handTitle: 'Iwwergab', handKicker: 'Deen nächsten Wiessel', handEmpty: 'Keng Iwwergab an deenen nächste sechs Wochen. Mollt de Kalenner, fir datt dir béid de Wiessel kennt.',
    from: 'Vun', to: 'Bei', time: 'Zäit', place: 'Plaz', bring: 'Mathuelen',
    addItem: 'Eppes derbäi', confirm: 'Ech sinn do', confirmed: 'Bestätegt',
    waitingFor: 'Waart op', bothReady: 'Dir hutt bestätegt. Noa gëtt erwaart.',
    youAre: 'Du bass', schoolGate: 'Schoulpaart',
    bag: 'Schoulsak', coat: 'Jackett', medicine: 'Medezin', sport: 'Sportssachen', comfort: 'Kuscheldéier',
    ask: 'En Dag froen', need: 'Dag, deen dir braucht', offer: 'Dag, deen dir ubidde kënnt',
    needHint: 'Tipp en Dag vum aneren Elterendeel.', offerHint: 'Dat sinn deng Deeg. Tipp een fir unzebidden.',
    offerDays: 'Deeg, déi dir ubidde kënnt', askDays: 'Deeg, déi dir froe kënnt', noneMonth: 'Keng dëse Mount.',
    needShort: 'Brauchen', offerShort: 'Bidden', clear: 'Läschen', request: 'Ufroen', note: 'Kuerze Grond',
    openSwaps: 'Oppe Ufroen', noSwaps: 'Keng oppe Ufroen.', accept: 'Unhuelen', decline: 'Ofleenen',
    locked: 'Dëse Mount ass gespaart.', as: 'Als',
    resolveLead: 'Een Thema, zwou Vue, ee Virschlag.',
    rulesTitle: 'Hausreegelen', rulesLead: 'Si gëllen, ier e Sträit ufänkt. Béid Elteren stëmmen eemol zou.',
    processTitle: 'Wéi e Sträit gekläert gëtt',
    r1: 'Een Thema no deem aneren. Éischt fäerdeg maachen oder pauséieren.',
    r2: 'Béid Vue stinn, ier een zoustëmmt.',
    r3: 'De Virschlag muss konkret sinn: Zäit, Plaz oder Betrag.',
    r4: 'Näischt ass definitiv, bis béid dermat liewen kënnen.',
    r5: 'Wann et waarm gëtt, Paus. Deen nächsten Dag weider.',
    ruleNotice: '24 Stonnen Virlaf fir eng Plänännerung, ausser d’Kand ass krank.',
    ruleDaily: 'Deen Elterendeel, deen d’Kand huet, entscheet déi kleng Alldagssachen.',
    ruleBig: 'Schoul, Gesondheet a Geld iwwer 50 € brauchen béid.',
    ruleFinal: 'Keng Decisioun ass definitiv, bis béid dermat liewen kënnen.',
    rulePause: 'Gëtt eng Notiz waarm, Paus. Net deeselwechten Dag entscheeden.',
    needBoth: 'Éischt béid Vue', needProposal: 'Éischt e Virschlag', paused: 'A Paus',
    now: 'Elo', waitingTopic: 'Waart', agreeRule: 'Ech stëmmen dëser Reegel zou',
    raise: 'Thema opmaachen', topic: 'Ëm wat geet et', view: 'Deng Vue, roueg',
    proposal: 'E Virschlag fir béid', pause: 'Paus', resume: 'Weider', live: 'Domat kann ech liewen',
    waiting: 'Waart op deen aneren', agreed: 'Dir sidd d’accord.', save: 'Bei de Pabeier späicheren', saved: 'Gespäichert',
    cooling: 'A Paus. Kommt zréck, wann dir roueg sidd.', emptyIssues: 'Keng oppen Themen.',
    handover: 'Iwwergab', school: 'Schoul', money: 'Geld', health: 'Gesondheet', other: 'Aneres',
    write: 'Eng kuerz Notiz', send: 'Schécken', emptyMsg: 'Nach näischt an dësem Fuedem.',
    heatTitle: 'Dës Notiz kléngt schaarf', heatLead: 'Ënnen steet eng méi roueg Fassong.',
    calmer: 'Roueg Fassong', sendCalm: 'Déi roueg Notiz schécken', sendAnyway: 'Esou schécken',
    papers: 'Pabeier', papersLead: 'Ofkommes fir iech béid.', emptyPapers: 'Nach keng Dokumenter.',
  },
}
function useCopy() {
  const { lang } = useLang()
  return COPY[lang] || COPY.en
}
function pretty(iso, lang) {
  const [y, m, d] = iso.split('-').map(Number)
  const locale = lang === 'fr' ? 'fr' : lang === 'de' ? 'de' : lang === 'lb' ? 'lb' : 'en'
  return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
}
const HEAT = [/\byou always\b/i, /\byou never\b/i, /\balways\b/i, /\bnever\b/i, /\balways\b/i, /\btoujours\b/i, /\bjamais\b/i, /\bimmer\b/i, /\bniemals\b/i, /\bëmmer\b/i]
function heatFlags(text) {
  const found = []
  for (const pattern of HEAT) {
    const match = text.match(pattern)
    if (match) found.push(match[0])
  }
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '')
  const caps = text.replace(/[^A-ZÀ-Ý]/g, '')
  if (letters.length > 8 && caps.length / letters.length > 0.6) found.push('SHOUTING')
  if ((text.match(/!/g) || []).length >= 3) found.push('!!!')
  return [...new Set(found)]
}
function soften(text) {
  return text
    .replace(/\byou always\b/gi, 'I need us to')
    .replace(/\byou never\b/gi, 'I need us to')
    .replace(/\b(always|never|toujours|jamais|immer|niemals|ëmmer)\b/gi, '')
    .replace(/!{2,}/g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim() || text
}

export function TodayBoard() {
  const { lang } = useLang()
  const c = useCopy()
  const [custody, setCustody] = useState(() => load('cp-custody', {}))
  const [locked] = useState(() => load('cp-locked', {}))
  const [swaps, setSwaps] = useState(() => load('cp-swaps', []))
  const [writer, setWriter] = useState(() => load('cp-writer', 'A'))
  useEffect(() => { save('cp-custody', custody) }, [custody])
  useEffect(() => { save('cp-swaps', swaps) }, [swaps])
  useEffect(() => { save('cp-writer', writer) }, [writer])
  const today = useMemo(() => new Date(), [])
  const todayKey = isoDate(today)
  const who = custody[todayKey]
  let change = null
  let prev = who
  for (let i = 1; i <= 42; i += 1) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    const key = isoDate(date)
    const owner = custody[key]
    if (owner !== 'A' && owner !== 'B') continue
    if ((prev === 'A' || prev === 'B') && owner !== prev) {
      change = { date: key, from: prev, to: owner }
      break
    }
    prev = owner
  }
  const label = (id) => (id === 'A' ? 'Alex' : 'Sam')
  return (
    <div className="app-panel">
      <div className="panel-head"><h2>{c.today}</h2></div>
      <p className="q-lead">{who === 'A' || who === 'B' ? `Noa ${c.with} ${label(who)}` : c.open}</p>
      <h3>{c.next}</h3>
      <p>{change ? `${pretty(change.date, lang)} · ${label(change.from)} → ${label(change.to)}` : c.none}</p>
      <AskDay custody={custody} setCustody={setCustody} locked={locked} swaps={swaps} setSwaps={setSwaps} writer={writer} setWriter={setWriter} />
    </div>
  )
}

function upcomingHandovers(custody, from, days = 42) {
  const found = []
  let prev = custody[isoDate(from)]
  for (let i = 1; i <= days; i += 1) {
    const date = new Date(from)
    date.setDate(from.getDate() + i)
    const key = isoDate(date)
    const owner = custody[key]
    if (owner !== 'A' && owner !== 'B') continue
    if ((prev === 'A' || prev === 'B') && owner !== prev) found.push({ date: key, from: prev, to: owner })
    prev = owner
  }
  return found
}

function defaultItems(c) {
  return [c.bag, c.coat, c.medicine, c.sport, c.comfort].map((label, index) => ({ id: `d${index}`, label, done: false }))
}

export function HandoverView() {
  const { lang } = useLang()
  const c = useCopy()
  const [custody] = useState(() => load('cp-custody', {}))
  const [writer, setWriter] = useState(() => load('cp-writer', 'A'))
  const [book, setBook] = useState(() => load('cp-handovers', {}))
  const [picked, setPicked] = useState('')
  const [draft, setDraft] = useState('')
  useEffect(() => { save('cp-writer', writer) }, [writer])
  useEffect(() => { save('cp-handovers', book) }, [book])
  const today = useMemo(() => new Date(), [])
  const changes = useMemo(() => upcomingHandovers(custody, today), [custody, today])
  const current = changes.find((item) => item.date === picked) || changes[0]
  const label = (id) => (id === 'A' ? 'Alex' : 'Sam')
  const entry = current ? (book[current.date] || { time: '18:00', place: c.schoolGate, items: defaultItems(c), yesA: false, yesB: false }) : null

  function patch(next) {
    if (!current) return
    setBook({ ...book, [current.date]: { ...entry, ...next } })
  }
  function toggleItem(id) {
    patch({ items: entry.items.map((item) => item.id === id ? { ...item, done: !item.done } : item) })
  }

  if (!current || !entry) {
    return (
      <section className="handover-screen">
        <p className="hand-kicker">{c.handKicker}</p>
        <h2>{c.handTitle}</h2>
        <p className="hand-empty">{c.handEmpty}</p>
      </section>
    )
  }

  const mine = writer === 'A' ? entry.yesA : entry.yesB
  const both = entry.yesA && entry.yesB
  const other = writer === 'A' ? 'B' : 'A'
  return (
    <section className="handover-screen">
      <div className="hand-top">
        <div>
          <p className="hand-kicker">{c.handKicker}</p>
          <h2>{pretty(current.date, lang)}</h2>
        </div>
        <div className="ask-switch">
          <span>{c.youAre}</span>
          {['A', 'B'].map((id) => (
            <button key={id} type="button" className={`btn ghost sm ${writer === id ? 'primary' : ''}`} onClick={() => setWriter(id)}>{label(id)}</button>
          ))}
        </div>
      </div>

      <div className="hand-pass">
        <div className={`hand-who ${current.from === 'A' ? 'a' : 'b'}`}>
          <span>{c.from}</span>
          <strong>{label(current.from)}</strong>
        </div>
        <span className="hand-arrow" aria-hidden="true">→</span>
        <div className={`hand-who ${current.to === 'A' ? 'a' : 'b'}`}>
          <span>{c.to}</span>
          <strong>{label(current.to)}</strong>
        </div>
      </div>

      <div className="hand-facts">
        <label>{c.time}
          <input type="time" value={entry.time} onChange={(event) => patch({ time: event.target.value, yesA: false, yesB: false })} />
        </label>
        <label>{c.place}
          <input value={entry.place} onChange={(event) => patch({ place: event.target.value, yesA: false, yesB: false })} />
        </label>
      </div>

      <div className="hand-bring">
        <h3>{c.bring}</h3>
        {entry.items.map((item) => (
          <button key={item.id} type="button" className={`hand-item ${item.done ? 'done' : ''}`} onClick={() => toggleItem(item.id)}>
            <span className="hand-check">{item.done ? '✓' : ''}</span>
            {item.label}
          </button>
        ))}
        <form className="hand-add" onSubmit={(event) => {
          event.preventDefault()
          const labelText = draft.trim()
          if (!labelText) return
          patch({ items: [...entry.items, { id: String(Date.now()), label: labelText, done: false }] })
          setDraft('')
        }}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={c.addItem} />
          <button className="btn ghost sm" type="submit">{c.addItem}</button>
        </form>
      </div>

      <div className={`hand-status ${both ? 'ready' : ''}`}>
        <p>{both ? c.bothReady : mine ? `${c.confirmed}. ${c.waitingFor} ${label(other)}.` : `${c.waitingFor} ${label(writer)}.`}</p>
        <button type="button" className={`btn ${mine ? 'ghost' : 'primary'}`} onClick={() => patch(writer === 'A' ? { yesA: !entry.yesA } : { yesB: !entry.yesB })}>
          {mine ? c.confirmed : c.confirm}
        </button>
      </div>

      {changes.length > 1 && (
        <div className="hand-later">
          {changes.slice(0, 4).map((item) => (
            <button key={item.date} type="button" className={`hand-later-item ${item.date === current.date ? 'on' : ''}`} onClick={() => setPicked(item.date)}>
              <span>{pretty(item.date, lang)}</span>
              <strong>{label(item.from)} → {label(item.to)}</strong>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function AskDay({ custody, setCustody, locked, swaps, setSwaps, writer, setWriter }) {
  const { lang } = useLang()
  const c = useCopy()
  const [cursor, setCursor] = useState(() => new Date())
  const [pick, setPick] = useState('need')
  const [want, setWant] = useState('')
  const [give, setGive] = useState('')
  const [note, setNote] = useState('')
  const [warn, setWarn] = useState('')
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  const lead = (new Date(year, month, 1).getDay() + 6) % 7
  const dim = new Date(year, month + 1, 0).getDate()
  const other = writer === 'A' ? 'B' : 'A'
  const days = Array.from({ length: dim }, (_, i) => {
    const key = `${monthKey}-${String(i + 1).padStart(2, '0')}`
    return { key, day: i + 1, owner: custody[key] }
  })
  const canOffer = days.filter((day) => day.owner === writer)
  const canAsk = days.filter((day) => day.owner === other)
  const label = (id) => (id === 'A' ? 'Alex' : 'Sam')
  function choose(key, owner) {
    if (locked[monthKey]) { setWarn(c.locked); return }
    if (pick === 'need') {
      if (owner !== other) return
      setWant(key); setPick('offer'); setWarn(''); return
    }
    if (owner !== writer || key === want) return
    setGive(key); setWarn('')
  }
  const open = swaps.filter((row) => row.status === 'open')
  return (
    <div>
      <div className="panel-head"><h2>{c.ask}</h2>
        <div className="ask-switch">
          <span>{c.as}</span>
          {['A', 'B'].map((id) => (
            <button key={id} type="button" className={`btn ghost sm ${writer === id ? 'primary' : ''}`} onClick={() => { setWriter(id); setWant(''); setGive(''); setPick('need') }}>{label(id)}</button>
          ))}
        </div>
      </div>
      <div className="ask-switch">
        <button type="button" className={`btn sm ${pick === 'need' ? 'primary' : 'ghost'}`} onClick={() => setPick('need')}>{c.need}</button>
        <button type="button" className={`btn sm ${pick === 'offer' ? 'primary' : 'ghost'}`} onClick={() => setPick('offer')}>{c.offer}</button>
      </div>
      <p className="q-lead">{pick === 'need' ? c.needHint : c.offerHint}</p>
      <div className="month-nav">
        <button className="btn ghost" type="button" onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</button>
        <strong>{cursor.toLocaleDateString(lang === 'fr' ? 'fr' : lang === 'de' ? 'de' : 'en', { month: 'long', year: 'numeric' })}</strong>
        <button className="btn ghost" type="button" onClick={() => setCursor(new Date(year, month + 1, 1))}>›</button>
      </div>
      {warn && <p className="lock-hint">{warn}</p>}
      <div className="cal-grid kid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((dow, i) => <div key={`${dow}-${i}`} className="cal-dow">{dow}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`p-${i}`} className="cal-cell empty" />)}
        {days.map((cell) => {
          const eligible = pick === 'need' ? cell.owner === other : cell.owner === writer
          const marked = cell.key === want || cell.key === give
          return (
            <button key={cell.key} type="button" className={`cal-cell day ${cell.owner || ''} ${eligible || marked ? '' : 'dim'} ${marked ? 'ask-picked' : ''}`} onClick={() => choose(cell.key, cell.owner)}>
              <span className="cal-day">{cell.day}</span>
              <span className="who">{cell.key === want ? c.needShort : cell.key === give ? c.offerShort : cell.owner === 'A' || cell.owner === 'B' ? label(cell.owner).slice(0, 4) : ''}</span>
            </button>
          )
        })}
      </div>
      <h3>{c.offerDays}</h3>
      <div className="ask-days">
        {canOffer.length === 0 && <span className="empty">{c.noneMonth}</span>}
        {canOffer.map((day) => (
          <button key={day.key} type="button" className={`btn sm ${give === day.key ? 'primary' : 'ghost'}`} onClick={() => { if (!locked[monthKey] && day.key !== want) { setGive(day.key); setPick('offer'); setWarn('') } }}>{pretty(day.key, lang)}</button>
        ))}
      </div>
      <h3>{c.askDays}</h3>
      <div className="ask-days">
        {canAsk.length === 0 && <span className="empty">{c.noneMonth}</span>}
        {canAsk.map((day) => (
          <button key={day.key} type="button" className={`btn sm ${want === day.key ? 'primary' : 'ghost'}`} onClick={() => { if (!locked[monthKey]) { setWant(day.key); setPick('offer'); setWarn('') } }}>{pretty(day.key, lang)}</button>
        ))}
      </div>
      <p>{c.needShort}: {want ? pretty(want, lang) : '–'} · {c.offerShort}: {give ? pretty(give, lang) : '–'}</p>
      <form className="add-form" onSubmit={(event) => {
        event.preventDefault()
        if (!want) return
        if (locked[want.slice(0, 7)] || (give && locked[give.slice(0, 7)])) { setWarn(c.locked); return }
        setSwaps([{ id: String(Date.now()), by: writer, want, give, note: note.trim(), status: 'open' }, ...swaps])
        setWant(''); setGive(''); setNote(''); setPick('need')
      }}>
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={c.note} />
        <button className="btn primary" type="submit" disabled={!want}>{c.request}</button>
      </form>
      <h3>{c.openSwaps}</h3>
      {open.length === 0 && <p className="empty">{c.noSwaps}</p>}
      {open.map((item) => (
        <div key={item.id} className="expense-row">
          <div><strong>{label(item.by)} · {pretty(item.want, lang)}{item.give ? ` → ${pretty(item.give, lang)}` : ''}</strong>{item.note && <span className="meta">{item.note}</span>}</div>
          <button className="btn primary sm" type="button" onClick={() => {
            if (locked[item.want.slice(0, 7)] || (item.give && locked[item.give.slice(0, 7)])) { setWarn(c.locked); return }
            const next = { ...custody, [item.want]: item.by }
            if (item.give) next[item.give] = item.by === 'A' ? 'B' : 'A'
            setCustody(next)
            setSwaps(swaps.map((row) => row.id === item.id ? { ...row, status: 'yes' } : row))
          }}>{c.accept}</button>
          <button className="btn ghost sm" type="button" onClick={() => setSwaps(swaps.map((row) => row.id === item.id ? { ...row, status: 'no' } : row))}>{c.decline}</button>
        </div>
      ))}
    </div>
  )
}

const SEED_RULES = [
  { id: 'notice', key: 'ruleNotice' },
  { id: 'daily', key: 'ruleDaily' },
  { id: 'big', key: 'ruleBig' },
  { id: 'final', key: 'ruleFinal' },
  { id: 'pause', key: 'rulePause' },
]

function concrete(text) {
  return /\d|€|eur|school|école|schule|schoul|gate|portail|tor|paart/i.test(text || '')
}

export function ResolveBoard() {
  const c = useCopy()
  const [writer, setWriter] = useState(() => load('cp-writer', 'A'))
  const [rules, setRules] = useState(() => load('cp-rules', SEED_RULES.map((rule) => ({ ...rule, yesA: false, yesB: false }))))
  const [issues, setIssues] = useState(() => load('cp-issues', [{
    id: 'i1', topic: 'Friday pickup time', about: 'handover',
    viewA: '18:00 works after work.', viewB: '17:30 so Noa is not last at the gate.',
    proposal: '18:00 on school days. 17:30 only if Alex writes before noon.',
    cooling: false, yesA: true, yesB: false, saved: false,
  }]))
  const [docs, setDocs] = useState(() => load('cp-docs', []))
  useEffect(() => { save('cp-writer', writer) }, [writer])
  useEffect(() => { save('cp-rules', rules) }, [rules])
  useEffect(() => { save('cp-issues', issues) }, [issues])
  useEffect(() => { save('cp-docs', docs) }, [docs])
  const label = (id) => (id === 'A' ? 'Alex' : 'Sam')
  const aboutName = (id) => c[id] || c.other
  const open = issues.filter((item) => !item.saved)
  const currentId = open[0]?.id
  function patch(id, next) { setIssues(issues.map((item) => item.id === id ? { ...item, ...next } : item)) }
  function patchRule(id, next) { setRules(rules.map((rule) => rule.id === id ? { ...rule, ...next } : rule)) }
  return (
    <div className="app-panel">
      <div className="panel-head">
        <h2>{c.resolve}</h2>
        <div className="ask-switch">{['A', 'B'].map((id) => <button key={id} type="button" className={`btn ghost sm ${writer === id ? 'primary' : ''}`} onClick={() => setWriter(id)}>{label(id)}</button>)}</div>
      </div>

      <section className="rules-card">
        <p className="hand-kicker">{c.rulesTitle}</p>
        <p className="q-lead">{c.rulesLead}</p>
        {rules.map((rule) => {
          const mine = writer === 'A' ? rule.yesA : rule.yesB
          const both = rule.yesA && rule.yesB
          return (
            <div key={rule.id} className={`rule-row ${both ? 'ready' : ''}`}>
              <p>{c[rule.key]}</p>
              <button type="button" className={`btn sm ${mine ? 'primary' : 'ghost'}`} onClick={() => patchRule(rule.id, writer === 'A' ? { yesA: !rule.yesA } : { yesB: !rule.yesB })}>
                {both ? c.bothReady : mine ? c.confirmed : c.agreeRule}
              </button>
            </div>
          )
        })}
      </section>

      <section className="rules-process">
        <h3>{c.processTitle}</h3>
        <ol>{[c.r1, c.r2, c.r3, c.r4, c.r5].map((rule) => <li key={rule}>{rule}</li>)}</ol>
      </section>

      <form className="add-form" onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const topic = String(data.get('topic') || '').trim()
        const view = String(data.get('view') || '').trim()
        if (!topic || !view) return
        setIssues([{ id: String(Date.now()), topic, about: String(data.get('about')), viewA: writer === 'A' ? view : '', viewB: writer === 'B' ? view : '', proposal: '', cooling: false, yesA: false, yesB: false, saved: false }, ...issues])
        event.currentTarget.reset()
      }}>
        <input name="topic" required placeholder={c.topic} />
        <select name="about">{['handover', 'school', 'money', 'health', 'other'].map((id) => <option key={id} value={id}>{aboutName(id)}</option>)}</select>
        <input name="view" required placeholder={c.view} />
        <button className="btn primary" type="submit">{c.raise}</button>
      </form>

      {issues.length === 0 && <p className="empty">{c.emptyIssues}</p>}
      {issues.map((item) => {
        const mine = writer === 'A' ? item.yesA : item.yesB
        const agreed = item.yesA && item.yesB
        const bothViews = Boolean(item.viewA.trim() && item.viewB.trim())
        const hasProposal = Boolean(item.proposal.trim()) && concrete(item.proposal)
        const isNow = item.id === currentId
        const blocked = item.cooling ? c.paused : !bothViews ? c.needBoth : !hasProposal ? c.needProposal : !isNow && !item.saved ? c.waitingTopic : ''
        return (
          <article key={item.id} className={`fiscal-card ${isNow ? 'now' : ''}`}>
            <div className="panel-head">
              <h3>{item.topic}</h3>
              <span className="pill">{item.saved ? c.saved : isNow ? c.now : c.waitingTopic}</span>
              <button type="button" className="btn ghost sm" onClick={() => patch(item.id, { cooling: !item.cooling })}>{item.cooling ? c.resume : c.pause}</button>
            </div>
            {item.cooling && <p className="lock-hint">{c.cooling}</p>}
            <label>Alex<textarea value={item.viewA} onChange={(event) => patch(item.id, { viewA: event.target.value, yesA: false, yesB: false, saved: false })} /></label>
            <label>Sam<textarea value={item.viewB} onChange={(event) => patch(item.id, { viewB: event.target.value, yesA: false, yesB: false, saved: false })} /></label>
            <label>{c.proposal}<textarea value={item.proposal} onChange={(event) => patch(item.id, { proposal: event.target.value, yesA: false, yesB: false, saved: false })} /></label>
            <button type="button" className={`btn sm ${mine ? 'primary' : 'ghost'}`} disabled={Boolean(blocked)} onClick={() => patch(item.id, writer === 'A' ? { yesA: !item.yesA } : { yesB: !item.yesB })}>{c.live}</button>
            {blocked && <span className="meta">{blocked}</span>}
            {!blocked && !agreed && <span className="meta">{c.waiting}</span>}
            {agreed && !item.saved && <button type="button" className="btn primary sm" onClick={() => { setDocs([{ id: String(Date.now()), title: item.topic, note: `${c.proposal}: ${item.proposal}\nAlex: ${item.viewA}\nSam: ${item.viewB}` }, ...docs]); patch(item.id, { saved: true, cooling: false }) }}>{c.save}</button>}
            {agreed && item.saved && <span className="meta">{c.saved}</span>}
          </article>
        )
      })}
    </div>
  )
}

export function Threads() {
  const c = useCopy()
  const [channel, setChannel] = useState('handover')
  const [writer, setWriter] = useState(() => load('cp-writer', 'A'))
  const [messages, setMessages] = useState(() => load('cp-messages', []))
  const [draft, setDraft] = useState('')
  const [hold, setHold] = useState(null)
  useEffect(() => { save('cp-writer', writer) }, [writer])
  useEffect(() => { save('cp-messages', messages) }, [messages])
  const thread = messages.filter((item) => item.channel === channel)
  function post(text) {
    const clean = text.trim()
    if (!clean) return
    setMessages([...messages, { id: String(Date.now()), channel, author: writer, text: clean }])
    setDraft(''); setHold(null)
  }
  return (
    <div className="app-panel">
      <div className="panel-head"><h2>{c.write}</h2>
        <div className="ask-switch">{['A', 'B'].map((id) => <button key={id} type="button" className={`btn ghost sm ${writer === id ? 'primary' : ''}`} onClick={() => setWriter(id)}>{id === 'A' ? 'Alex' : 'Sam'}</button>)}</div>
      </div>
      <div className="ask-switch">{['handover', 'school', 'money', 'health'].map((id) => <button key={id} type="button" className={`btn sm ${channel === id ? 'primary' : 'ghost'}`} onClick={() => setChannel(id)}>{c[id]}</button>)}</div>
      {thread.length === 0 && <p className="empty">{c.emptyMsg}</p>}
      {thread.map((item) => <p key={item.id} className={`pill ${item.author === 'A' ? 'a' : 'b'}`}><strong>{item.author === 'A' ? 'Alex' : 'Sam'}</strong> {item.text}</p>)}
      <form className="add-form" onSubmit={(event) => { event.preventDefault(); const flags = heatFlags(draft); if (flags.length) { setHold({ original: draft, softer: soften(draft), flags }); return } post(draft) }}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={c.write} />
        <button className="btn primary" type="submit">{c.send}</button>
      </form>
      {hold && <div className="fiscal-banner"><strong>{c.heatTitle}</strong><p>{c.heatLead}</p><p>{hold.flags.join(' · ')}</p><textarea value={hold.softer} onChange={(event) => setHold({ ...hold, softer: event.target.value })} /><div className="ask-switch"><button type="button" className="btn primary sm" onClick={() => post(hold.softer)}>{c.sendCalm}</button><button type="button" className="btn ghost sm" onClick={() => post(hold.original)}>{c.sendAnyway}</button></div></div>}
    </div>
  )
}

export function Papers() {
  const c = useCopy()
  const [docs, setDocs] = useState(() => load('cp-docs', []))
  useEffect(() => { save('cp-docs', docs) }, [docs])
  return (
    <div className="app-panel">
      <div className="panel-head"><h2>{c.papers}</h2></div>
      <p className="q-lead">{c.papersLead}</p>
      {docs.length === 0 && <p className="empty">{c.emptyPapers}</p>}
      {docs.map((item) => <article key={item.id} className="fiscal-card"><h3>{item.title}</h3><p>{item.note}</p></article>)}
      <form className="add-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const title = String(data.get('title') || '').trim(); if (!title) return; setDocs([{ id: String(Date.now()), title, note: String(data.get('note') || '') }, ...docs]); event.currentTarget.reset() }}>
        <input name="title" placeholder={c.topic} required />
        <input name="note" placeholder={c.note} />
        <button className="btn primary" type="submit">{c.save}</button>
      </form>
    </div>
  )
}

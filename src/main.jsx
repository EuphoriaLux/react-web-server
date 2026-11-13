import React, { useState, useEffect, useMemo, createContext, useContext } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowRight, Check, Shield, Heart, Clock, Users, Menu, X, Sparkles,
  Info, HelpCircle, Calendar, Wallet, MessageSquare, FileText, Plus,
  ChevronLeft, ChevronRight, Home, Trash2, Globe,
} from 'lucide-react'
import './style.css'

/* ─── i18n ─── */
const LangCtx = createContext()
export function useLang() { return useContext(LangCtx) }

const t = {
  en: {
    lang: 'EN',
    problem: 'The problem', how: 'How it helps', works: 'How it works', fiscal: 'Fiscal help (LU)',
    demo: 'Demo', enter: 'Enter shared space', back: 'Back to site',
    eyebrow: 'Built for parents who still share a child',
    h1a: 'Co-parenting', h1b: 'without the chaos',
    lead: 'One calm, shared space for schedules, expenses, messages and documents. Less friction between you. More clarity for your child.',
    see: 'See how it works',
    trust1: 'Private by design', trust2: 'Both parents equal', trust3: 'Built for real life',
    frictionLabel: 'The friction', frictionH2a: 'Separation is hard enough.', frictionH2b: 'Logistics shouldn’t make it worse.',
    frictionLead: 'When two households raise the same child, small gaps in information quickly become conflict. CoParents is designed to close those gaps.',
    f1t: 'Missed handovers', f1: 'Last-minute schedule changes and unclear pickup times create stress for everyone.',
    f2t: 'Expense disputes', f2: 'Who paid for school trip, clothes, activities? The spreadsheet never stays current.',
    f3t: 'Messages that escalate', f3: 'Ordinary logistics turn emotional in chat threads with no structure or history.',
    f4t: 'Scattered papers', f4: 'Agreements, medical notes and school forms live in inboxes, drives and drawers.',
    solLabel: 'The space', solH2a: 'Everything you both need,', solH2b: 'in one shared place',
    solLead: 'Not another chat thread. Not another spreadsheet. A focused toolkit that keeps decisions calm and visible.',
    feat1t: 'Shared calendar', feat1: 'One source of truth for handovers, school events, holidays and medical appointments. Both parents see the same plan.',
    feat2t: 'Transparent expenses', feat2: 'Log costs, attach receipts and settle fairly. Fewer arguments about who paid for what.',
    feat3t: 'Structured messages', feat3: 'Keep conversations focused on the child. Less emotional noise, clearer decisions.',
    feat4t: 'Secure documents', feat4: 'Agreements, school reports, medical records and ID copies — always available to both of you.',
    howLabel: 'Onboarding', howH2: 'From invite to shared rhythm',
    howLead: 'Five clear steps. No complex setup — just the essentials both of you can trust.',
    s1t: 'Create your parent profile', s1: 'Tell us the basics: children, households and how you already share care. Takes a few minutes.',
    s2t: 'Invite the other parent', s2: 'Send a private invite. Both of you keep equal visibility and control — no one is locked out.',
    s3t: 'Set the shared rhythm', s3: 'Bring in the calendar, handovers and recurring costs. Start from what already exists.',
    s4t: 'Agree simple expense rules', s4: 'Decide how shared costs are logged and settled. Fewer surprises at the end of the month.',
    s5t: 'Optional: fiscal notes', s5: 'Save documents and notes about tax status. CoParents helps you stay organised — not replace an advisor.',
    fiscLabel: 'Luxembourg · Fiscal orientation', fiscH2: 'Help with tax status for co-parents',
    fiscLead: 'A plain-language map of the current classes and the 2028 single-class reform — so you know what to track together. Not personalised tax advice.',
    fiscBanner: 'Timeline: tax years 2026–2027 still use classes 1, 1a and 2. Class U applies from 1 January 2028 (tax year 2028). 2027 is a preparation year — including optional elections for some couples before 30 Nov 2027.',
    fc1t: 'Through tax year 2027', fc1: 'Luxembourg still uses classes 1, 1a and 2. Separated or divorced parents are often in class 1 or 1a (especially when a child tax moderation applies).',
    fc2t: 'From 1 January 2028 — Class U', fc2: 'A single tax class (Classe U) replaces 1, 1a and 2 for most people. Civil status no longer decides the scale. Individual taxation becomes the default.',
    fc3t: 'After divorce or separation', fc3: 'If you were jointly taxed in class 2, you can keep the transitional Tarif T for five years after the end of cohabitation (up from three years today), unless you opt earlier for Class U.',
    fc4t: 'Single-parent credit', fc4: 'The maximum crédit d’impôt monoparental rises from €3,504 to €4,008. The effective amount still depends on income and maintenance received.',
    fc5t: 'Child not in your household', fc5: 'The allowance for a child who is not part of your tax household is raised from €5,424 to €5,928. Useful when the child lives mainly with the other parent.',
    fc6t: 'Shared care ≠ double credits', fc6: 'Joint custody does not automatically mean each parent gets the full set of child credits. Where both parents live with the child, many benefits are split 50/50; a sole parent may claim 100%.',
    fiscNote: 'CoParents can store agreements, receipts and notes so both parents stay aligned. For filings and elections, use the official ACD tools or a qualified advisor. Sources: adopted single tax class reform (Oct 2026); official guidance expected to expand in 2027.',
    valLabel: 'Principles', valH2a: 'Built around the child,', valH2b: 'not the conflict',
    valP: 'CoParents is intentionally calm. Structure reduces emotional load so conversations stay practical and fair.',
    v1t: 'Equal access', v1: 'Both parents see the same information. No one is locked out.',
    v2t: 'Calm by default', v2: 'Structure reduces emotional load so conversations stay practical.',
    v3t: 'Privacy first', v3: 'Your family data stays private. Designed for real life, not surveillance.',
    ctaH2: 'Ready to lower the temperature?', ctaP: 'Create a shared space that keeps logistics clear and the focus where it belongs — on your child.',
    ctaNote: 'No account needed. Demo runs in this browser.',
    footerTag: 'Less friction. More clarity. Better for the kids.',
    footerMeta: 'CoParents · Concept preview',
    appTitle: 'CoParents demo',
    tabCal: 'Calendar', tabExp: 'Expenses', tabMsg: 'Messages', tabDoc: 'Docs',
    calTitle: 'Shared calendar',
    both: 'Both', paintAs: 'Assign', clear: 'Clear', altWeeks: 'Alt. weeks (A)', altWeeksB: 'Alt. weeks (B)', weekendA: 'Every other weekend A', monthA: 'Whole month A', monthB: 'Whole month B', clearMonth: 'Clear month', addEvent: 'Add note / event',
    propose: 'Propose a fair plan',
    qTitle: 'A few questions for a fair proposal',
    qLead: 'Answer quickly. We’ll suggest a month where both parents get similar holiday time with the child.',
    q1: 'Preferred base rhythm',
    q1a: 'Alternate full weeks',
    q1b: 'Every other weekend + mid-week',
    q1c: 'Mostly 50/50 weekdays',
    q2: 'Who prefers more weekends?',
    q2a: 'Parent A',
    q2b: 'Parent B',
    q2c: 'Equal',
    q3: 'School holidays priority',
    q3a: 'Split each holiday period',
    q3b: 'Alternate whole periods',
    q4: 'Start the proposal from',
    generate: 'Generate proposal',
    apply: 'Apply this month',
    balance: 'Holiday days',
    close: 'Close',
    holidays: 'Holidays',
    h_newyear: 'New Year',
    h_eastermon: 'Easter Monday',
    h_labour: 'Labour Day',
    h_europe: 'Europe Day',
    h_ascension: 'Ascension',
    h_whitmon: 'Whit Monday',
    h_national: 'National Day',
    h_assumption: 'Assumption',
    h_allsaints: 'All Saints',
    h_christmas: 'Christmas',
    h_stephen: 'St Stephen',
    eventTitle: 'Event title', add: 'Add',
    typeEvent: 'Event', typeHandover: 'Handover', typeSchool: 'School', typeMedical: 'Medical',
    expTitle: 'Transparent expenses',
    noExp: 'No expenses yet. Add the first one below.',
    desc: 'Description', amount: 'Amount',
    paidA: 'Paid by A', paidB: 'Paid by B',
    split50: '50/50', splitA: '100% A', splitB: '100% B',
    paidBy: 'Paid by', split: 'split',
    msgTitle: 'Messages', msgText: 'Structured threads coming next. For now, use the calendar and expenses.',
    docTitle: 'Documents', docText: 'Shared vault coming next. Store agreements and notes here later.',
  },
  fr: {
    lang: 'FR',
    problem: 'Le problème', how: 'Comment ça aide', works: 'Comment ça marche', fiscal: 'Aide fiscale (LU)',
    demo: 'Démo', enter: 'Entrer dans l’espace partagé', back: 'Retour au site',
    eyebrow: 'Conçu pour les parents qui partagent encore un enfant',
    h1a: 'Co-parentalité', h1b: 'sans le chaos',
    lead: 'Un espace calme et partagé pour les plannings, les dépenses, les messages et les documents. Moins de friction entre vous. Plus de clarté pour votre enfant.',
    see: 'Voir comment ça marche',
    trust1: 'Privé par conception', trust2: 'Les deux parents à égalité', trust3: 'Conçu pour la vraie vie',
    frictionLabel: 'La friction', frictionH2a: 'La séparation est déjà assez difficile.', frictionH2b: 'La logistique ne devrait pas l’aggraver.',
    frictionLead: 'Quand deux foyers élèvent le même enfant, de petits manques d’information deviennent vite des conflits. CoParents est conçu pour combler ces écarts.',
    f1t: 'Gardes manquées', f1: 'Des changements de planning de dernière minute et des heures de récupération floues créent du stress pour tout le monde.',
    f2t: 'Litiges de dépenses', f2: 'Qui a payé la sortie scolaire, les vêtements, les activités ? Le tableur n’est jamais à jour.',
    f3t: 'Messages qui dégénèrent', f3: 'La logistique ordinaire devient émotionnelle dans des fils de discussion sans structure ni historique.',
    f4t: 'Papiers éparpillés', f4: 'Accords, notes médicales et formulaires scolaires vivent dans des boîtes mail, des drives et des tiroirs.',
    solLabel: 'L’espace', solH2a: 'Tout ce dont vous avez besoin,', solH2b: 'dans un seul endroit partagé',
    solLead: 'Pas un énième fil de discussion. Pas un autre tableur. Un outil ciblé qui garde les décisions calmes et visibles.',
    feat1t: 'Calendrier partagé', feat1: 'Une source unique pour les gardes, les événements scolaires, les vacances et les rendez-vous médicaux. Les deux parents voient le même plan.',
    feat2t: 'Dépenses transparentes', feat2: 'Enregistrez les coûts, joignez les reçus et réglez équitablement. Moins de disputes sur qui a payé quoi.',
    feat3t: 'Messages structurés', feat3: 'Gardez les conversations centrées sur l’enfant. Moins de bruit émotionnel, des décisions plus claires.',
    feat4t: 'Documents sécurisés', feat4: 'Accords, bulletins, dossiers médicaux et copies d’identité — toujours disponibles pour vous deux.',
    howLabel: 'Prise en main', howH2: 'De l’invitation au rythme partagé',
    howLead: 'Cinq étapes claires. Pas de configuration complexe — juste l’essentiel auquel vous pouvez tous les deux faire confiance.',
    s1t: 'Créer votre profil parent', s1: 'Les bases : enfants, foyers et comment vous partagez déjà la garde. Quelques minutes suffisent.',
    s2t: 'Inviter l’autre parent', s2: 'Envoyez une invitation privée. Vous gardez tous les deux une visibilité et un contrôle égaux.',
    s3t: 'Définir le rythme partagé', s3: 'Apportez le calendrier, les gardes et les coûts récurrents. Partez de ce qui existe déjà.',
    s4t: 'Convenir de règles de dépenses simples', s4: 'Décidez comment les coûts partagés sont enregistrés et réglés. Moins de surprises en fin de mois.',
    s5t: 'Optionnel : notes fiscales', s5: 'Conservez documents et notes sur le statut fiscal. CoParents aide à s’organiser — il ne remplace pas un conseiller.',
    fiscLabel: 'Luxembourg · Orientation fiscale', fiscH2: 'Aide sur le statut fiscal pour les co-parents',
    fiscLead: 'Une carte en langage clair des classes actuelles et de la réforme de classe unique 2028 — pour savoir ce qu’il faut suivre ensemble. Pas un conseil fiscal personnalisé.',
    fiscBanner: 'Calendrier : les années fiscales 2026–2027 utilisent encore les classes 1, 1a et 2. La Classe U s’applique à partir du 1er janvier 2028 (année fiscale 2028). 2027 est une année de préparation — y compris des options pour certains couples avant le 30 nov. 2027.',
    fc1t: 'Jusqu’à l’année fiscale 2027', fc1: 'Le Luxembourg utilise encore les classes 1, 1a et 2. Les parents séparés ou divorcés sont souvent en classe 1 ou 1a (surtout lorsqu’une modération fiscale pour enfant s’applique).',
    fc2t: 'À partir du 1er janvier 2028 — Classe U', fc2: 'Une classe d’impôt unique (Classe U) remplace 1, 1a et 2 pour la plupart des personnes. L’état civil ne décide plus du barème. L’imposition individuelle devient la règle.',
    fc3t: 'Après divorce ou séparation', fc3: 'Si vous étiez imposés conjointement en classe 2, vous pouvez conserver le Tarif T transitoire pendant cinq ans après la fin de la cohabitation (contre trois aujourd’hui), sauf option anticipée pour la Classe U.',
    fc4t: 'Crédit parent isolé', fc4: 'Le maximum du crédit d’impôt monoparental passe de 3 504 € à 4 008 €. Le montant effectif dépend toujours du revenu et de la pension alimentaire reçue.',
    fc5t: 'Enfant hors de votre foyer', fc5: 'L’abattement pour un enfant qui ne fait pas partie de votre foyer fiscal passe de 5 424 € à 5 928 €. Utile lorsque l’enfant vit principalement chez l’autre parent.',
    fc6t: 'Garde partagée ≠ double crédits', fc6: 'La garde conjointe ne signifie pas automatiquement que chaque parent reçoit l’ensemble des crédits enfants. Lorsque les deux parents vivent avec l’enfant, de nombreuses aides sont partagées 50/50 ; un parent unique peut prétendre à 100 %.',
    fiscNote: 'CoParents peut stocker accords, reçus et notes pour que les deux parents restent alignés. Pour les déclarations et options, utilisez les outils officiels de l’ACD ou un conseiller qualifié. Sources : réforme de classe unique adoptée (oct. 2026) ; guidances officielles attendues en 2027.',
    valLabel: 'Principes', valH2a: 'Construit autour de l’enfant,', valH2b: 'pas du conflit',
    valP: 'CoParents est volontairement calme. La structure réduit la charge émotionnelle pour que les conversations restent pratiques et équitables.',
    v1t: 'Accès égal', v1: 'Les deux parents voient les mêmes informations. Personne n’est exclu.',
    v2t: 'Calme par défaut', v2: 'La structure réduit la charge émotionnelle pour que les échanges restent pratiques.',
    v3t: 'Confidentialité d’abord', v3: 'Les données de votre famille restent privées. Conçu pour la vraie vie, pas la surveillance.',
    ctaH2: 'Prêt à baisser la température ?', ctaP: 'Créez un espace partagé qui garde la logistique claire et le focus là où il doit être — sur votre enfant.',
    ctaNote: 'Aucun compte nécessaire. La démo tourne dans ce navigateur.',
    footerTag: 'Moins de friction. Plus de clarté. Mieux pour les enfants.',
    footerMeta: 'CoParents · Aperçu concept',
    appTitle: 'Démo CoParents',
    tabCal: 'Calendrier', tabExp: 'Dépenses', tabMsg: 'Messages', tabDoc: 'Documents',
    calTitle: 'Calendrier partagé',
    both: 'Les deux', paintAs: 'Attribuer', clear: 'Effacer', altWeeks: 'Semaines alt. (A)', altWeeksB: 'Semaines alt. (B)', weekendA: 'Un week-end sur deux A', monthA: 'Tout le mois A', monthB: 'Tout le mois B', clearMonth: 'Effacer le mois', addEvent: 'Ajouter une note / événement',
    propose: 'Proposer un plan équitable',
    qTitle: 'Quelques questions pour une proposition équitable',
    qLead: 'Répondez rapidement. Nous proposerons un mois où les deux parents ont un temps de vacances similaire avec l’enfant.',
    q1: 'Rythme de base préféré',
    q1a: 'Semaines complètes en alternance',
    q1b: 'Un week-end sur deux + milieu de semaine',
    q1c: 'Principalement 50/50 en semaine',
    q2: 'Qui préfère plus de week-ends ?',
    q2a: 'Parent A',
    q2b: 'Parent B',
    q2c: 'Égal',
    q3: 'Priorité vacances scolaires',
    q3a: 'Partager chaque période',
    q3b: 'Alterner des périodes entières',
    q4: 'Commencer la proposition à partir de',
    generate: 'Générer la proposition',
    apply: 'Appliquer ce mois',
    balance: 'Jours de vacances',
    close: 'Fermer',
    holidays: 'Jours fériés',
    h_newyear: 'Jour de l’An',
    h_eastermon: 'Lundi de Pâques',
    h_labour: 'Fête du Travail',
    h_europe: 'Journée de l’Europe',
    h_ascension: 'Ascension',
    h_whitmon: 'Lundi de Pentecôte',
    h_national: 'Fête nationale',
    h_assumption: 'Assomption',
    h_allsaints: 'Toussaint',
    h_christmas: 'Noël',
    h_stephen: 'Saint-Étienne',
    eventTitle: 'Titre de l’événement', add: 'Ajouter',
    typeEvent: 'Événement', typeHandover: 'Garde', typeSchool: 'École', typeMedical: 'Médical',
    expTitle: 'Dépenses transparentes',
    noExp: 'Aucune dépense pour le moment. Ajoutez la première ci-dessous.',
    desc: 'Description', amount: 'Montant',
    paidA: 'Payé par A', paidB: 'Payé par B',
    split50: '50/50', splitA: '100 % A', splitB: '100 % B',
    paidBy: 'Payé par', split: 'répartition',
    msgTitle: 'Messages', msgText: 'Les fils structurés arrivent bientôt. Pour l’instant, utilisez le calendrier et les dépenses.',
    docTitle: 'Documents', docText: 'Le coffre partagé arrive bientôt. Vous pourrez y stocker accords et notes.',
  },
  de: {
    lang: 'DE',
    problem: 'Das Problem', how: 'Wie es hilft', works: 'So funktioniert’s', fiscal: 'Steuerhilfe (LU)',
    demo: 'Demo', enter: 'Gemeinsamen Bereich öffnen', back: 'Zurück zur Seite',
    eyebrow: 'Für Eltern, die noch ein Kind gemeinsam betreuen',
    h1a: 'Co-Parenting', h1b: 'ohne das Chaos',
    lead: 'Ein ruhiger, gemeinsamer Raum für Termine, Ausgaben, Nachrichten und Dokumente. Weniger Reibung zwischen euch. Mehr Klarheit für euer Kind.',
    see: 'So funktioniert’s',
    trust1: 'Privat by Design', trust2: 'Beide Eltern gleichberechtigt', trust3: 'Für das echte Leben gebaut',
    frictionLabel: 'Die Reibung', frictionH2a: 'Eine Trennung ist schwer genug.', frictionH2b: 'Die Logistik sollte sie nicht noch schwerer machen.',
    frictionLead: 'Wenn zwei Haushalte dasselbe Kind großziehen, werden kleine Informationslücken schnell zu Konflikten. CoParents schließt diese Lücken.',
    f1t: 'Verpasste Übergaben', f1: 'Last-minute-Änderungen und unklare Abholzeiten erzeugen Stress für alle.',
    f2t: 'Ausgabenstreit', f2: 'Wer hat den Schulausflug, Kleidung, Aktivitäten bezahlt? Die Tabelle ist nie aktuell.',
    f3t: 'Nachrichten, die eskalieren', f3: 'Alltägliche Logistik wird emotional in Chat-Verläufen ohne Struktur oder Historie.',
    f4t: 'Verstreute Papiere', f4: 'Vereinbarungen, medizinische Notizen und Schulformulare liegen in Postfächern, Drives und Schubladen.',
    solLabel: 'Der Raum', solH2a: 'Alles, was ihr beide braucht,', solH2b: 'an einem gemeinsamen Ort',
    solLead: 'Kein weiterer Chat-Verlauf. Keine weitere Tabelle. Ein fokussiertes Toolkit, das Entscheidungen ruhig und sichtbar hält.',
    feat1t: 'Gemeinsamer Kalender', feat1: 'Eine Quelle der Wahrheit für Übergaben, Schultermine, Ferien und Arztbesuche. Beide Eltern sehen denselben Plan.',
    feat2t: 'Transparente Ausgaben', feat2: 'Kosten erfassen, Belege anhängen und fair abrechnen. Weniger Streit darüber, wer was bezahlt hat.',
    feat3t: 'Strukturierte Nachrichten', feat3: 'Gespräche auf das Kind fokussieren. Weniger emotionales Rauschen, klarere Entscheidungen.',
    feat4t: 'Sichere Dokumente', feat4: 'Vereinbarungen, Schulberichte, Krankenakten und Ausweiskopien — immer für beide verfügbar.',
    howLabel: 'Onboarding', howH2: 'Von der Einladung zum gemeinsamen Rhythmus',
    howLead: 'Fünf klare Schritte. Kein kompliziertes Setup — nur das Wesentliche, dem ihr beide vertrauen könnt.',
    s1t: 'Elternprofil anlegen', s1: 'Die Grundlagen: Kinder, Haushalte und wie ihr die Betreuung bereits teilt. Dauert wenige Minuten.',
    s2t: 'Anderen Elternteil einladen', s2: 'Private Einladung senden. Beide behalten gleiche Sichtbarkeit und Kontrolle.',
    s3t: 'Gemeinsamen Rhythmus festlegen', s3: 'Kalender, Übergaben und wiederkehrende Kosten einbringen. Von dem starten, was schon existiert.',
    s4t: 'Einfache Ausgabenregeln vereinbaren', s4: 'Festlegen, wie gemeinsame Kosten erfasst und abgerechnet werden. Weniger Überraschungen am Monatsende.',
    s5t: 'Optional: Steuer-Notizen', s5: 'Dokumente und Notizen zum Steuerstatus speichern. CoParents hilft beim Organisieren — ersetzt keinen Berater.',
    fiscLabel: 'Luxemburg · Steuerorientierung', fiscH2: 'Hilfe zum Steuerstatus für Co-Eltern',
    fiscLead: 'Eine verständliche Karte der aktuellen Klassen und der Einzelklassen-Reform 2028 — damit ihr wisst, was ihr gemeinsam tracken solltet. Keine personalisierte Steuerberatung.',
    fiscBanner: 'Zeitplan: Steuerjahre 2026–2027 nutzen noch die Klassen 1, 1a und 2. Klasse U gilt ab 1. Januar 2028 (Steuerjahr 2028). 2027 ist ein Vorbereitungsjahr — einschließlich optionaler Wahlen für manche Paare vor dem 30. Nov. 2027.',
    fc1t: 'Bis Steuerjahr 2027', fc1: 'Luxemburg nutzt noch die Klassen 1, 1a und 2. Getrennte oder geschiedene Eltern sind oft in Klasse 1 oder 1a (besonders wenn eine Kindersteuerermäßigung gilt).',
    fc2t: 'Ab 1. Januar 2028 — Klasse U', fc2: 'Eine einzige Steuerklasse (Classe U) ersetzt 1, 1a und 2 für die meisten Menschen. Der Familienstand entscheidet nicht mehr über den Tarif. Einzelveranlagung wird der Standard.',
    fc3t: 'Nach Scheidung oder Trennung', fc3: 'Wenn ihr gemeinsam in Klasse 2 veranlagt wart, könnt ihr den Übergangs-Tarif T fünf Jahre nach Ende des Zusammenlebens behalten (bisher drei), außer ihr optiert früher für Klasse U.',
    fc4t: 'Alleinerziehenden-Kredit', fc4: 'Der maximale crédit d’impôt monoparental steigt von 3.504 € auf 4.008 €. Der effektive Betrag hängt weiterhin von Einkommen und erhaltenem Unterhalt ab.',
    fc5t: 'Kind nicht im eigenen Haushalt', fc5: 'Der Freibetrag für ein Kind, das nicht zum eigenen Steuerhaushalt gehört, steigt von 5.424 € auf 5.928 €. Nützlich, wenn das Kind hauptsächlich beim anderen Elternteil lebt.',
    fc6t: 'Geteilte Betreuung ≠ doppelte Credits', fc6: 'Gemeinsames Sorgerecht bedeutet nicht automatisch, dass jeder Elternteil den vollen Satz an Kinder-Credits erhält. Wo beide Eltern mit dem Kind leben, werden viele Leistungen 50/50 geteilt; ein Alleinerziehender kann 100 % beanspruchen.',
    fiscNote: 'CoParents kann Vereinbarungen, Belege und Notizen speichern, damit beide Eltern im Einklang bleiben. Für Erklärungen und Optionen die offiziellen ACD-Tools oder einen qualifizierten Berater nutzen. Quellen: verabschiedete Einzelklassen-Reform (Okt. 2026); offizielle Hinweise werden 2027 erweitert.',
    valLabel: 'Prinzipien', valH2a: 'Um das Kind herum gebaut,', valH2b: 'nicht um den Konflikt',
    valP: 'CoParents ist bewusst ruhig. Struktur reduziert die emotionale Last, damit Gespräche praktisch und fair bleiben.',
    v1t: 'Gleicher Zugang', v1: 'Beide Eltern sehen dieselben Informationen. Niemand ist ausgeschlossen.',
    v2t: 'Ruhig by Default', v2: 'Struktur reduziert die emotionale Last, damit Gespräche praktisch bleiben.',
    v3t: 'Privatsphäre zuerst', v3: 'Eure Familiendaten bleiben privat. Für das echte Leben gebaut, nicht für Überwachung.',
    ctaH2: 'Bereit, die Temperatur zu senken?', ctaP: 'Schafft einen gemeinsamen Raum, der die Logistik klar hält und den Fokus dorthin legt, wo er hingehört — auf euer Kind.',
    ctaNote: 'Kein Konto nötig. Die Demo läuft in diesem Browser.',
    footerTag: 'Weniger Reibung. Mehr Klarheit. Besser für die Kinder.',
    footerMeta: 'CoParents · Konzeptvorschau',
    appTitle: 'CoParents Demo',
    tabCal: 'Kalender', tabExp: 'Ausgaben', tabMsg: 'Nachrichten', tabDoc: 'Dokumente',
    calTitle: 'Gemeinsamer Kalender',
    both: 'Beide', paintAs: 'Zuweisen', clear: 'Löschen', altWeeks: 'Wechselnde Wochen (A)', altWeeksB: 'Wechselnde Wochen (B)', weekendA: 'Jedes zweite Wochenende A', monthA: 'Ganzer Monat A', monthB: 'Ganzer Monat B', clearMonth: 'Monat löschen', addEvent: 'Notiz / Ereignis',
    propose: 'Fairen Plan vorschlagen',
    qTitle: 'Ein paar Fragen für einen fairen Vorschlag',
    qLead: 'Schnell beantworten. Wir schlagen einen Monat vor, in dem beide Eltern ähnliche Ferienzeit mit dem Kind haben.',
    q1: 'Bevorzugter Grundrhythmus',
    q1a: 'Ganze Wochen im Wechsel',
    q1b: 'Jedes zweite Wochenende + Mitte der Woche',
    q1c: 'Überwiegend 50/50 unter der Woche',
    q2: 'Wer bevorzugt mehr Wochenenden?',
    q2a: 'Elternteil A',
    q2b: 'Elternteil B',
    q2c: 'Gleich',
    q3: 'Priorität Schulferien',
    q3a: 'Jede Ferienperiode teilen',
    q3b: 'Ganze Perioden abwechseln',
    q4: 'Vorschlag starten ab',
    generate: 'Vorschlag erzeugen',
    apply: 'Diesen Monat anwenden',
    balance: 'Ferientage',
    close: 'Schließen',
    holidays: 'Feiertage',
    h_newyear: 'Neujahr',
    h_eastermon: 'Ostermontag',
    h_labour: 'Tag der Arbeit',
    h_europe: 'Europatag',
    h_ascension: 'Christi Himmelfahrt',
    h_whitmon: 'Pfingstmontag',
    h_national: 'Nationalfeiertag',
    h_assumption: 'Mariä Himmelfahrt',
    h_allsaints: 'Allerheiligen',
    h_christmas: 'Weihnachten',
    h_stephen: 'Stephanstag',
    eventTitle: 'Ereignistitel', add: 'Hinzufügen',
    typeEvent: 'Ereignis', typeHandover: 'Übergabe', typeSchool: 'Schule', typeMedical: 'Medizinisch',
    expTitle: 'Transparente Ausgaben',
    noExp: 'Noch keine Ausgaben. Füge die erste unten hinzu.',
    desc: 'Beschreibung', amount: 'Betrag',
    paidA: 'Bezahlt von A', paidB: 'Bezahlt von B',
    split50: '50/50', splitA: '100 % A', splitB: '100 % B',
    paidBy: 'Bezahlt von', split: 'Aufteilung',
    msgTitle: 'Nachrichten', msgText: 'Strukturierte Threads kommen als Nächstes. Bis dahin Kalender und Ausgaben nutzen.',
    docTitle: 'Dokumente', docText: 'Der gemeinsame Tresor kommt als Nächstes. Hier könnt ihr später Vereinbarungen und Notizen ablegen.',
  },
  lb: {
    lang: 'LB',
    problem: 'De Problem', how: 'Wéi et hëlleft', works: 'Wéi et fonctionéiert', fiscal: 'Steierhëllef (LU)',
    demo: 'Demo', enter: 'Gemeinsame Raum opmaachen', back: 'Zréck op d’Säit',
    eyebrow: 'Fir Elteren, déi nach e Kand zesumme betreien',
    h1a: 'Co-Parenting', h1b: 'ouni de Chaos',
    lead: 'Ee rouege, gemeinsame Raum fir Terminer, Ausgaben, Messagen an Dokumenter. Manner Reibung tëscht iech. Méi Kloerheet fir Äert Kand.',
    see: 'Kuckt wéi et funktionéiert',
    trust1: 'Privat by Design', trust2: 'Béid Elteren gläichberechtegt', trust3: 'Fir dat richtegt Liewen gebaut',
    frictionLabel: 'D’Reibung', frictionH2a: 'Eng Trennung ass scho schwéier genuch.', frictionH2b: 'D’Logistik sollt et net nach méi schwéier maachen.',
    frictionLead: 'Wann zwéi Haushälter datselwecht Kand grousszéien, ginn kleng Informatiounslücken séier zu Konflikter. CoParents mécht déi Lücken zou.',
    f1t: 'Verpasst Iwwergaben', f1: 'Last-minute Ännerungen an onkloer Ofhuelzäiten maachen Stress fir jiddereen.',
    f2t: 'Ausgabestreit', f2: 'Wie huet de Schoulausfluch, d’Kleeder, d’Aktivitéiten bezuelt? D’Tabell ass ni aktuell.',
    f3t: 'Messagen, déi eskaléieren', f3: 'Alldeeglech Logistik gëtt emotional a Chat-Verleef ouni Struktur oder Historie.',
    f4t: 'Verstreet Pabeier', f4: 'Ofkommes, medezinesch Notizen a Schoulformulaire leien a Postfächer, Drives an Tiräng.',
    solLabel: 'De Raum', solH2a: 'Alles wat dir béid braucht,', solH2b: 'op enger gemeinsamer Plaz',
    solLead: 'Keen weidere Chat-Verlaf. Keng weider Tabell. Een fokusséiert Toolkit, dat Entscheedungen roueg a siichtbar hält.',
    feat1t: 'Gemeinsame Kalenner', feat1: 'Eng Quell vun der Wourecht fir Iwwergaben, Schoulterminer, Vakanzen an Doktervisiten. Béid Eltere gesinn de selwechte Plang.',
    feat2t: 'Transparent Ausgaben', feat2: 'Käschten erfaassen, Beleeger bäifügen an fair ofrechnen. Manner Sträit iwwer wie wat bezuelt huet.',
    feat3t: 'Strukturéiert Messagen', feat3: 'Gespréicher op d’Kand fokusséieren. Manner emotionalt Rauschen, méi kloer Entscheedungen.',
    feat4t: 'Sécher Dokumenter', feat4: 'Ofkommes, Schoulberichter, Krankeakten an Ausweiskopien — ëmmer fir béid verfügbar.',
    howLabel: 'Onboarding', howH2: 'Vun der Aluedung zum gemeinsame Rhythmus',
    howLead: 'Fënnef kloer Schrëtt. Keen komplizéierten Setup — just dat Wichtegst, deem dir béid vertrauen kënnt.',
    s1t: 'Elterprofil uleeën', s1: 'D’Grondlagen: Kanner, Haushälter a wéi dir d’Betreiung scho deelt. Dauert e puer Minutten.',
    s2t: 'Aneren Elterendeel alueden', s2: 'Privat Aluedung schécken. Béid behalen déi selwecht Visibilitéit a Kontroll.',
    s3t: 'Gemeinsame Rhythmus festleeën', s3: 'Kalenner, Iwwergaben a widderhuelend Käschten erabrénge. Vun deem starten, wat scho existéiert.',
    s4t: 'Einfach Ausgabenregelen ofmaachen', s4: 'Festleeën, wéi gemeinsam Käschten erfaasst an ofgerechent ginn. Manner Iwwerraschungen um Monatsenn.',
    s5t: 'Optional: Steier-Notizen', s5: 'Dokumenter a Notizen zum Steierstatus späicheren. CoParents hëlleft beim Organiséieren — ersetzt keen Beroder.',
    fiscLabel: 'Lëtzebuerg · Steierorientéierung', fiscH2: 'Hëllef zum Steierstatus fir Co-Elteren',
    fiscLead: 'Eng verständlech Kaart vun den aktuellen Klassen an der Eenzelklassen-Reform 2028 — fir ze wëssen, wat dir zesummen tracke sollt. Keng personaliséiert Steierberodung.',
    fiscBanner: 'Zäitplang: Steierjore 2026–2027 benotzen nach d’Klassen 1, 1a an 2. Klass U gëllt vum 1. Januar 2028 (Steierjoer 2028). 2027 ass e Virbereedungsjoer — inklusiv optionaler Wahlen fir verschidde Koppelen virum 30. Nov. 2027.',
    fc1t: 'Bis Steierjoer 2027', fc1: 'Lëtzebuerg benotzt nach d’Klassen 1, 1a an 2. Getrennten oder gescheedten Eltere sinn dacks a Klass 1 oder 1a (besonnesch wann eng Kannersteiererliichterung gëllt).',
    fc2t: 'Vum 1. Januar 2028 — Klass U', fc2: 'Eng eenzeg Steierklass (Classe U) ersetzt 1, 1a an 2 fir déi meescht Leit. De Familljestand entscheed net méi iwwer den Tarif. Eenzelveranlagung gëtt de Standard.',
    fc3t: 'No Scheedung oder Trennung', fc3: 'Wann dir zesummen a Klass 2 veranlagt war, kënnt dir den Iwwergangs-Tarif T fënnef Joer no Enn vum Zesummeliewen behalen (bis elo dräi), ausser dir optéiert éischter fir Klass U.',
    fc4t: 'Alleinerzéienden-Kredit', fc4: 'De maximale crédit d’impôt monoparental klëmmt vun 3.504 € op 4.008 €. De effektive Betrag hänkt weiderhin vum Akommes an erhalenem Ënnerhalt of.',
    fc5t: 'Kand net am eegene Haushalt', fc5: 'De Fräibetrag fir e Kand, dat net zum eegene Steierhaushalt gehéiert, klëmmt vun 5.424 € op 5.928 €. Nëtzlech, wann d’Kand haaptsächlech beim aneren Elterendeel lieft.',
    fc6t: 'Gedeelt Betreiung ≠ duebel Credits', fc6: 'Gemeinsamt Sorgerecht bedeit net automatesch, datt all Elterendeel de vollen Satz u Kanner-Credits kritt. Wou béid Elteren mam Kand liewen, ginn vill Leeschtungen 50/50 gedeelt; een Alleinerzéienden kann 100 % beanspruchen.',
    fiscNote: 'CoParents kann Ofkommes, Beleeger a Notizen späicheren, fir datt béid Elteren am Aklang bleiwen. Fir Erklärungen an Optiounen déi offiziell ACD-Tools oder e qualifizéierte Beroder benotzen. Quellen: ugeholl Eenzelklassen-Reform (Okt. 2026); offiziell Hiwäiser ginn 2027 erweidert.',
    valLabel: 'Prinzipien', valH2a: 'Ëm d’Kand hier gebaut,', valH2b: 'net ëm de Konflikt',
    valP: 'CoParents ass bewosst roueg. Struktur reduzéiert déi emotional Laascht, fir datt Gespréicher praktesch a fair bleiwen.',
    v1t: 'Gläichen Zougang', v1: 'Béid Eltere gesinn déi selwecht Informatiounen. Keen ass ausgeschloss.',
    v2t: 'Roueg by Default', v2: 'Struktur reduzéiert déi emotional Laascht, fir datt Gespréicher praktesch bleiwen.',
    v3t: 'Privatsphär fir d’éischt', v3: 'Är Familljendate bleiwen privat. Fir dat richtegt Liewen gebaut, net fir Iwwerwaachung.',
    ctaH2: 'Prett, d’Temperatur ze senken?', ctaP: 'Schaaft ee gemeinsame Raum, deen d’Logistik kloer hält an de Fokus dohinner leet, wou e hi gehéiert — op Äert Kand.',
    ctaNote: 'Keen Kont néideg. D’Demo leeft an dësem Browser.',
    footerTag: 'Manner Reibung. Méi Kloerheet. Besser fir d’Kanner.',
    footerMeta: 'CoParents · Konzeptvirschau',
    appTitle: 'CoParents Demo',
    tabCal: 'Kalenner', tabExp: 'Ausgaben', tabMsg: 'Messagen', tabDoc: 'Dokumenter',
    calTitle: 'Gemeinsame Kalenner',
    both: 'Béid', paintAs: 'Zouweisen', clear: 'Läschen',
    altWeeks: 'Wiesselnd Woch (A)', altWeeksB: 'Wiesselnd Woch (B)',
    weekendA: 'All zweet Weekend A', monthA: 'Ganze Mount A', monthB: 'Ganze Mount B',
    clearMonth: 'Mount läschen', addEvent: 'Notiz / Evenement',
    propose: 'E faire Plang proposéieren',
    qTitle: 'E puer Froen fir e faire Virschlag',
    qLead: 'Séier äntweren. Mir proposéieren e Mount wou béid Elteren ähnlech Vakanzenzäit mam Kand hunn.',
    q1: 'Bevorzuchten Basisrhythmus',
    q1a: 'Ganz Wochen am Wiessel',
    q1b: 'All zweet Weekend + Mëtt vun der Woch',
    q1c: 'Haaptsächlech 50/50 an der Woch',
    q2: 'Wie bevorzugt méi Weekenden?',
    q2a: 'Elterendeel A',
    q2b: 'Elterendeel B',
    q2c: 'Gläich',
    q3: 'Prioritéit Schoulvakanzen',
    q3a: 'All Period deelen',
    q3b: 'Ganz Perioden wiesselen',
    q4: 'Virschlag starten vun',
    generate: 'Virschlag generéieren',
    apply: 'Dëse Mount uwenden',
    balance: 'Vakanzendeeg',
    close: 'Zoumaachen',
    eventTitle: 'Evenementstitel', add: 'Dobäisetzen',
    typeEvent: 'Evenement', typeHandover: 'Iwwergab', typeSchool: 'Schoul', typeMedical: 'Medezinesch',
    expTitle: 'Transparent Ausgaben',
    noExp: 'Nach keng Ausgaben. Setzt déi éischt ënnen dobäi.',
    desc: 'Beschreiwung', amount: 'Betrag',
    paidA: 'Bezuelt vun A', paidB: 'Bezuelt vun B',
    split50: '50/50', splitA: '100 % A', splitB: '100 % B',
    paidBy: 'Bezuelt vun', split: 'Opdeelung',
    msgTitle: 'Messagen', msgText: 'Strukturéiert Threads kommen als Nächstes. Bis dohin Kalenner an Ausgaben benotzen.',
    docTitle: 'Dokumenter', docText: 'De gemeinsame Tresor kënnt als Nächstes. Hei kënnt dir spéider Ofkommes a Notizen ofleeën.',
    holidays: 'Feierdeeg',
    h_newyear: 'Neijoerschdag', h_eastermon: 'Ouschterméindeg', h_labour: 'Dag vun der Aarbecht',
    h_europe: 'Europadag', h_ascension: 'Christi Himmelfahrt', h_whitmon: 'Päischtméindeg',
    h_national: 'Nationalfeierdag', h_assumption: 'Léiffrawëschdag', h_allsaints: 'Allerhellegen',
    h_christmas: 'Chrëschtdag', h_stephen: 'Stiefesdag',
  },

}

function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('cp-lang') || 'en')
  useEffect(() => { localStorage.setItem('cp-lang', lang) }, [lang])
  const value = { lang, setLang, tr: t[lang] || t.en }
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>
}

function LangSwitch() {
  const { lang, setLang } = useLang()
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      {['en','fr','de','lb'].map((code) => (
        <button
          key={code}
          type="button"
          className={lang === code ? 'active' : ''}
          onClick={() => setLang(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

/* ─── SVGs (unchanged) ─── */
function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 520 440" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="gHouseA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#f0f5fb" /></linearGradient>
        <linearGradient id="gHouseB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#edf8f5" /></linearGradient>
        <linearGradient id="gBridge" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#0d9488" stopOpacity="0.15" /><stop offset="50%" stopColor="#0d9488" stopOpacity="0.35" /><stop offset="100%" stopColor="#0d9488" stopOpacity="0.15" /></linearGradient>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#0c1f38" floodOpacity="0.1" /></filter>
      </defs>
      <ellipse className="ha-ground" cx="260" cy="400" rx="200" ry="18" fill="#dfe8f2" opacity="0.55" />
      <g className="ha-house ha-house-l" filter="url(#soft)">
        <path d="M48 210 L110 152 L172 210 Z" fill="#0d9488" opacity="0.9" />
        <rect x="58" y="210" width="104" height="96" rx="10" fill="url(#gHouseA)" stroke="#d5e0ec" />
        <rect x="78" y="232" width="28" height="28" rx="5" fill="#cce8e3" />
        <rect x="114" y="232" width="28" height="28" rx="5" fill="#cce8e3" />
        <rect x="96" y="268" width="28" height="38" rx="5" fill="#0f2744" opacity="0.85" />
      </g>
      <g className="ha-house ha-house-r" filter="url(#soft)">
        <path d="M348 210 L410 152 L472 210 Z" fill="#0f766e" opacity="0.85" />
        <rect x="358" y="210" width="104" height="96" rx="10" fill="url(#gHouseB)" stroke="#d5e0ec" />
        <rect x="378" y="232" width="28" height="28" rx="5" fill="#d5f0ea" />
        <rect x="414" y="232" width="28" height="28" rx="5" fill="#d5f0ea" />
        <rect x="396" y="268" width="28" height="38" rx="5" fill="#0f2744" opacity="0.85" />
      </g>
      <path d="M162 258 C210 220, 310 220, 358 258" stroke="url(#gBridge)" strokeWidth="18" strokeLinecap="round" fill="none" />
      <path className="ha-bridge" d="M162 258 C210 220, 310 220, 358 258" pathLength="1" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="0.08 0.12" fill="none" opacity="0.65" />
      <g className="ha-cal" filter="url(#soft)">
        <rect x="218" y="188" width="84" height="92" rx="16" fill="white" stroke="#d5e0ec" />
        <rect x="218" y="188" width="84" height="26" rx="16" fill="#0d9488" />
        <rect x="218" y="204" width="84" height="10" fill="#0d9488" />
        <circle cx="236" cy="201" r="3.5" fill="white" opacity="0.9" />
        <circle cx="284" cy="201" r="3.5" fill="white" opacity="0.9" />
        <circle className="ha-dot" cx="236" cy="240" r="4" fill="#0d9488" />
        <circle cx="260" cy="240" r="4" fill="#94a3b8" opacity="0.45" />
        <circle className="ha-dot ha-dot-delay" cx="284" cy="240" r="4" fill="#2563eb" />
        <circle cx="236" cy="262" r="4" fill="#94a3b8" opacity="0.45" />
        <circle className="ha-dot ha-dot-delay2" cx="260" cy="262" r="4" fill="#d97706" />
        <circle cx="284" cy="262" r="4" fill="#94a3b8" opacity="0.45" />
      </g>
      <g className="ha-heart" transform="translate(248 156)">
        <circle cx="12" cy="12" r="16" fill="#ccfbf1" stroke="#99f6e4" />
        <path d="M12 20.5 C12 20.5 5 15.2 5 10.8 C5 8.4 6.8 6.8 9 6.8 C10.4 6.8 11.5 7.5 12 8.5 C12.5 7.5 13.6 6.8 15 6.8 C17.2 6.8 19 8.4 19 10.8 C19 15.2 12 20.5 12 20.5 Z" fill="#0d9488" />
      </g>
      <g className="ha-chip ha-chip-l" filter="url(#soft)">
        <rect x="86" y="118" width="108" height="36" rx="18" fill="white" stroke="#e2eaf3" />
        <circle cx="106" cy="136" r="8" fill="#ccfbf1" />
        <rect x="120" y="130" width="54" height="6" rx="3" fill="#d5e0ec" />
        <rect x="120" y="140" width="36" height="5" rx="2.5" fill="#e8eef5" />
      </g>
      <g className="ha-chip ha-chip-r" filter="url(#soft)">
        <rect x="330" y="118" width="108" height="36" rx="18" fill="white" stroke="#e2eaf3" />
        <circle cx="350" cy="136" r="8" fill="#dbeafe" />
        <rect x="364" y="130" width="54" height="6" rx="3" fill="#d5e0ec" />
        <rect x="364" y="140" width="36" height="5" rx="2.5" fill="#e8eef5" />
      </g>
      <g className="ha-child" transform="translate(248 300)">
        <circle cx="12" cy="10" r="9" fill="#fde68a" />
        <rect x="4" y="20" width="16" height="14" rx="6" fill="#fbbf24" opacity="0.85" />
      </g>
    </svg>
  )
}
function IconCalendar() { return (<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="6" y="10" width="36" height="32" rx="8" fill="#ccfbf1" /><rect x="6" y="10" width="36" height="10" rx="8" fill="#0d9488" /><rect x="6" y="16" width="36" height="4" fill="#0d9488" /><circle cx="16" cy="15" r="2" fill="white" /><circle cx="32" cy="15" r="2" fill="white" /><circle cx="16" cy="30" r="2.5" fill="#0d9488" /><circle cx="24" cy="30" r="2.5" fill="#94a3b8" opacity="0.5" /><circle cx="32" cy="30" r="2.5" fill="#2563eb" /><circle cx="16" cy="36" r="2.5" fill="#94a3b8" opacity="0.5" /><circle cx="24" cy="36" r="2.5" fill="#d97706" /></svg>) }
function IconWallet() { return (<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="6" y="14" width="36" height="24" rx="7" fill="#ccfbf1" /><rect x="6" y="14" width="36" height="8" rx="4" fill="#0d9488" opacity="0.9" /><rect x="28" y="24" width="14" height="10" rx="3" fill="#0f766e" /><circle cx="35" cy="29" r="2" fill="#99f6e4" /><path d="M12 12h18a4 4 0 0 1 4 4" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" /></svg>) }
function IconMessages() { return (<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="6" y="10" width="28" height="20" rx="8" fill="#ccfbf1" /><path d="M12 30 L12 36 L18 30" fill="#ccfbf1" /><rect x="16" y="18" width="26" height="18" rx="8" fill="#0d9488" /><path d="M36 36 L36 42 L30 36" fill="#0d9488" /><circle cx="24" cy="27" r="1.8" fill="white" /><circle cx="30" cy="27" r="1.8" fill="white" /><circle cx="36" cy="27" r="1.8" fill="white" /></svg>) }
function IconDocs() { return (<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="12" y="6" width="24" height="32" rx="5" fill="#ccfbf1" /><rect x="10" y="10" width="24" height="32" rx="5" fill="white" stroke="#d5e0ec" /><path d="M28 10h6v6h-6a2 2 0 0 1-2-2v-4z" fill="#0d9488" opacity="0.85" /><rect x="16" y="22" width="14" height="2.5" rx="1.2" fill="#94a3b8" opacity="0.55" /><rect x="16" y="28" width="12" height="2.5" rx="1.2" fill="#94a3b8" opacity="0.4" /><rect x="16" y="34" width="10" height="2.5" rx="1.2" fill="#94a3b8" opacity="0.3" /><circle cx="34" cy="34" r="8" fill="#0d9488" /><path d="M31 34.5 L33 36.5 L37.5 31.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>) }
function IconHandover() { return (<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="12" cy="14" r="5" fill="#fecaca" /><circle cx="28" cy="14" r="5" fill="#bfdbfe" /><path d="M8 28c0-4 2.5-6 4-6s4 2 4 6" stroke="#f87171" strokeWidth="2.2" strokeLinecap="round" /><path d="M24 28c0-4 2.5-6 4-6s4 2 4 6" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round" /><path d="M15 20h10" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" /></svg>) }
function IconExpense() { return (<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="8" y="10" width="24" height="22" rx="4" fill="#fecaca" /><path d="M14 16h12M14 21h12M14 26h8" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" opacity="0.7" /><circle cx="28" cy="12" r="7" fill="#fff" stroke="#fecaca" /><path d="M28 9v6M25.5 12h5" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></svg>) }
function IconEscalate() { return (<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M8 12h16a6 6 0 0 1 6 6v2a6 6 0 0 1-6 6H14l-6 5v-5a6 6 0 0 1-0-14z" fill="#fecaca" /><path d="M18 18h6M18 22h4" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" opacity="0.75" /><path d="M30 8l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z" fill="#f87171" /></svg>) }
function IconScatter() { return (<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="6" y="8" width="14" height="18" rx="2.5" fill="#fecaca" transform="rotate(-8 13 17)" /><rect x="16" y="10" width="14" height="18" rx="2.5" fill="#fda4af" transform="rotate(6 23 19)" /><rect x="12" y="14" width="14" height="18" rx="2.5" fill="white" stroke="#fecaca" /><path d="M16 20h6M16 24h5" stroke="#f87171" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" /></svg>) }
function ValuesArt() { return (<svg className="values-art" viewBox="0 0 320 220" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="vg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ccfbf1" /><stop offset="100%" stopColor="#e0f2fe" /></linearGradient></defs><rect x="20" y="30" width="280" height="160" rx="24" fill="url(#vg)" opacity="0.55" /><g transform="translate(70 55)"><circle cx="40" cy="36" r="16" fill="#0d9488" opacity="0.9" /><rect x="24" y="54" width="32" height="40" rx="12" fill="#0d9488" opacity="0.75" /><circle cx="140" cy="36" r="16" fill="#0f766e" opacity="0.9" /><rect x="124" y="54" width="32" height="40" rx="12" fill="#0f766e" opacity="0.75" /><circle cx="90" cy="52" r="12" fill="#fbbf24" /><rect x="78" y="66" width="24" height="28" rx="10" fill="#f59e0b" opacity="0.9" /><path className="va-arc" d="M56 40 C70 20, 110 20, 124 40" pathLength="1" stroke="#0d9488" strokeWidth="2.5" strokeDasharray="0.12 0.1" strokeLinecap="round" opacity="0.55" fill="none" /></g><circle className="va-orb" cx="52" cy="48" r="6" fill="#99f6e4" /><circle className="va-orb va-orb-2" cx="268" cy="170" r="8" fill="#bae6fd" /><circle className="va-orb va-orb-3" cx="250" cy="50" r="5" fill="#99f6e4" opacity="0.8" /></svg>) }

function load(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback } catch { return fallback } }
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)) }


/* ─── Luxembourg public holidays ─── */
function easterSunday(y) {
  const a = y % 19
  const b = Math.floor(y / 100)
  const c = y % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(y, month - 1, day)
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function isoDate(d) { return d.toISOString().slice(0, 10) }
function luxHolidays(year, tr) {
  const easter = easterSunday(year)
  const fixed = [
    [new Date(year, 0, 1), tr.h_newyear],
    [addDays(easter, 1), tr.h_eastermon],
    [new Date(year, 4, 1), tr.h_labour],
    [new Date(year, 4, 9), tr.h_europe],
    [addDays(easter, 39), tr.h_ascension],
    [addDays(easter, 50), tr.h_whitmon],
    [new Date(year, 5, 23), tr.h_national],
    [new Date(year, 7, 15), tr.h_assumption],
    [new Date(year, 10, 1), tr.h_allsaints],
    [new Date(year, 11, 25), tr.h_christmas],
    [new Date(year, 11, 26), tr.h_stephen],
  ]
  const map = {}
  for (const [d, name] of fixed) map[isoDate(d)] = name
  return map
}


function generateFairPlan(year, month, answers, holidays) {
  const days = new Date(year, month + 1, 0).getDate()
  const plan = {}
  const isWeekend = (d) => { const dow = (new Date(year, month, d).getDay() + 6) % 7; return dow >= 5 }
  const isHoliday = (d) => {
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    return !!holidays[key]
  }
  // Collect holiday + weekend days that need balancing
  const special = []
  for (let d = 1; d <= days; d++) {
    if (isHoliday(d) || isWeekend(d)) special.push(d)
  }
  // Assign special days aiming for equal count
  let aCount = 0, bCount = 0
  const preferA = answers.weekends === 'A'
  const preferB = answers.weekends === 'B'
  special.forEach((d, i) => {
    let who
    if (preferA && aCount <= bCount + 1) who = 'A'
    else if (preferB && bCount <= aCount + 1) who = 'B'
    else who = aCount <= bCount ? 'A' : 'B'
    plan[d] = who
    if (who === 'A') aCount++; else bCount++
  })
  // Fill remaining weekdays according to rhythm
  for (let d = 1; d <= days; d++) {
    if (plan[d]) continue
    if (answers.rhythm === 'weeks') {
      const week = Math.floor((d + ((new Date(year, month, 1).getDay()+6)%7) - 1) / 7)
      plan[d] = week % 2 === 0 ? 'A' : 'B'
    } else if (answers.rhythm === 'weekend-mid') {
      const dow = (new Date(year, month, d).getDay() + 6) % 7
      plan[d] = dow === 2 || dow === 3 ? 'B' : 'A' // mid-week B, rest A as base
    } else {
      plan[d] = d % 2 === 0 ? 'A' : 'B'
    }
  }
  return plan
}

function Questionnaire({ year, month, holidays, onApply, onClose, tr }) {
  const [answers, setAnswers] = useState({ rhythm: 'weeks', weekends: 'equal', holidays: 'split' })
  const [preview, setPreview] = useState(null)
  const generate = () => {
    const plan = generateFairPlan(year, month, answers, holidays)
    // count holiday days
    let aH = 0, bH = 0
    for (let d = 1; d <= new Date(year, month+1, 0).getDate(); d++) {
      const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      if (holidays[key]) {
        if (plan[d] === 'A') aH++; else if (plan[d] === 'B') bH++
      }
    }
    setPreview({ plan, aH, bH })
  }
  return (
    <div className="q-overlay" onClick={onClose}>
      <div className="q-card" onClick={(e) => e.stopPropagation()}>
        <div className="q-head">
          <h3>{tr.qTitle}</h3>
          <button className="btn ghost" type="button" onClick={onClose}>{tr.close}</button>
        </div>
        <p className="q-lead">{tr.qLead}</p>
        <label>{tr.q1}</label>
        <div className="q-options">
          <button type="button" className={answers.rhythm==='weeks'?'on':''} onClick={() => setAnswers({...answers, rhythm:'weeks'})}>{tr.q1a}</button>
          <button type="button" className={answers.rhythm==='weekend-mid'?'on':''} onClick={() => setAnswers({...answers, rhythm:'weekend-mid'})}>{tr.q1b}</button>
          <button type="button" className={answers.rhythm==='half'?'on':''} onClick={() => setAnswers({...answers, rhythm:'half'})}>{tr.q1c}</button>
        </div>
        <label>{tr.q2}</label>
        <div className="q-options">
          <button type="button" className={answers.weekends==='A'?'on':''} onClick={() => setAnswers({...answers, weekends:'A'})}>{tr.q2a}</button>
          <button type="button" className={answers.weekends==='B'?'on':''} onClick={() => setAnswers({...answers, weekends:'B'})}>{tr.q2b}</button>
          <button type="button" className={answers.weekends==='equal'?'on':''} onClick={() => setAnswers({...answers, weekends:'equal'})}>{tr.q2c}</button>
        </div>
        <label>{tr.q3}</label>
        <div className="q-options">
          <button type="button" className={answers.holidays==='split'?'on':''} onClick={() => setAnswers({...answers, holidays:'split'})}>{tr.q3a}</button>
          <button type="button" className={answers.holidays==='alternate'?'on':''} onClick={() => setAnswers({...answers, holidays:'alternate'})}>{tr.q3b}</button>
        </div>
        <div className="q-actions">
          <button className="btn primary" type="button" onClick={generate}>{tr.generate}</button>
        </div>
        {preview && (
          <div className="q-preview">
            <div className="kid-summary">
              <span className="pill a">{tr.balance} A · {preview.aH}</span>
              <span className="pill b">{tr.balance} B · {preview.bH}</span>
            </div>
            <button className="btn primary" type="button" onClick={() => onApply(preview.plan)}>{tr.apply}</button>
          </div>
        )}
      </div>
    </div>
  )
}

function CalendarView() {
  const { tr } = useLang()
  const [custody, setCustody] = useState(() => load('cp-custody', {}))
  const [showQ, setShowQ] = useState(false)
  const [events, setEvents] = useState(() => load('cp-events', []))
  const [cursor, setCursor] = useState(() => new Date())
  const [mode, setMode] = useState('paint') // paint | event
  const [paint, setPaint] = useState('A')
  const [form, setForm] = useState({ title: '', date: '', type: 'event' })

  useEffect(() => { save('cp-custody', custody) }, [custody])
  useEffect(() => { save('cp-events', events) }, [events])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const first = new Date(year, month, 1)
  const startPad = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const iso = (d) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const locale = tr.lang === 'FR' ? 'fr' : tr.lang === 'DE' ? 'de' : 'en'
  const monthLabel = cursor.toLocaleString(locale, { month: 'long', year: 'numeric' })
  const hols = luxHolidays(year, tr)

  const setDay = (d, who) => {
    const key = iso(d)
    setCustody((prev) => {
      const next = { ...prev }
      if (!who) delete next[key]
      else next[key] = who
      return next
    })
  }

  const cycleDay = (d) => {
    const key = iso(d)
    const cur = custody[key]
    const order = [null, 'A', 'B', 'both']
    const next = order[(order.indexOf(cur) + 1) % order.length]
    setDay(d, next)
  }

  const paintDay = (d) => {
    if (mode === 'event') return
    setDay(d, paint === 'clear' ? null : paint)
  }

  // Quick plans
  const planAlternateWeeks = (startWith) => {
    const next = { ...custody }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      const week = Math.floor((d + startPad - 1) / 7)
      next[iso(d)] = week % 2 === 0 ? startWith : (startWith === 'A' ? 'B' : 'A')
    }
    setCustody(next)
  }
  const planEveryOtherWeekend = (who) => {
    const next = { ...custody }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      const dow = (date.getDay() + 6) % 7 // Mon=0
      const isWeekend = dow >= 5
      const week = Math.floor((d + startPad - 1) / 7)
      if (isWeekend && week % 2 === 0) next[iso(d)] = who
      else if (!next[iso(d)]) next[iso(d)] = who === 'A' ? 'B' : 'A'
    }
    setCustody(next)
  }
  const planWholeMonth = (who) => {
    const next = { ...custody }
    for (let d = 1; d <= daysInMonth; d++) next[iso(d)] = who
    setCustody(next)
  }
  const clearMonth = () => {
    const next = { ...custody }
    for (let d = 1; d <= daysInMonth; d++) delete next[iso(d)]
    setCustody(next)
  }

  const counts = { A: 0, B: 0, both: 0 }
  for (let d = 1; d <= daysInMonth; d++) {
    const w = custody[iso(d)]
    if (w === 'A') counts.A++
    else if (w === 'B') counts.B++
    else if (w === 'both') counts.both++
  }

  const addEvent = (e) => {
    e.preventDefault()
    if (!form.title || !form.date) return
    setEvents((p) => [...p, { id: Date.now(), ...form }])
    setForm({ title: '', date: '', type: 'event' })
  }
  const removeEvent = (id) => setEvents((p) => p.filter((x) => x.id !== id))

  const weekdays = tr.lang === 'FR'
    ? ['L','M','M','J','V','S','D']
    : tr.lang === 'DE'
    ? ['Mo','Di','Mi','Do','Fr','Sa','So']
    : ['M','T','W','T','F','S','S']

  return (
    <div className="app-panel kid-cal">
      <div className="panel-head">
        <h2>{tr.calTitle}</h2>
        <div className="month-nav">
          <button className="btn ghost" type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Prev"><ChevronLeft size={20} /></button>
          <strong>{monthLabel}</strong>
          <button className="btn ghost" type="button" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next"><ChevronRight size={20} /></button>
        </div>
      </div>

      <div className="kid-summary">
        <span className="pill a">A · {counts.A}</span>
        <span className="pill b">B · {counts.B}</span>
        <span className="pill both">{tr.both || 'Both'} · {counts.both}</span>
        <span className="pill holiday">{tr.holidays || 'Holidays'}</span>
      </div>

      <div className="paint-bar">
        <span className="paint-label">{tr.paintAs || 'Assign'}</span>
        <button type="button" className={`paint a ${paint === 'A' && mode === 'paint' ? 'on' : ''}`} onClick={() => { setMode('paint'); setPaint('A') }}>A</button>
        <button type="button" className={`paint b ${paint === 'B' && mode === 'paint' ? 'on' : ''}`} onClick={() => { setMode('paint'); setPaint('B') }}>B</button>
        <button type="button" className={`paint both ${paint === 'both' && mode === 'paint' ? 'on' : ''}`} onClick={() => { setMode('paint'); setPaint('both') }}>{tr.both || 'Both'}</button>
        <button type="button" className={`paint clear ${paint === 'clear' && mode === 'paint' ? 'on' : ''}`} onClick={() => { setMode('paint'); setPaint('clear') }}>{tr.clear || 'Clear'}</button>
      </div>

      <div className="cal-grid kid">
        {weekdays.map((d, i) => <div key={i} className="cal-dow">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="cal-cell empty" />
          const key = iso(d)
          const who = custody[key]
          const dayEvents = events.filter((ev) => ev.date === key)
          const hol = hols[key]
          return (
            <button
              key={i}
              type="button"
              className={`cal-cell day ${who || ''} ${hol ? 'holiday' : ''}`}
              onClick={() => paintDay(d)}
              onDoubleClick={() => cycleDay(d)}
              aria-label={`${d} ${who || 'none'} ${hol || ''}`}
              title={hol || undefined}
            >
              <span className="cal-day">{d}</span>
              {who && <span className="who">{who === 'both' ? 'AB' : who}</span>}
              {hol && <span className="hol-name">{hol}</span>}
              {dayEvents.length > 0 && <span className="dot" />}
            </button>
          )
        })}
      </div>

      <div className="plan-row">
        <button type="button" className="btn primary sm" onClick={() => setShowQ(true)}>{tr.propose}</button>
        <button type="button" className="btn ghost sm" onClick={() => planAlternateWeeks('A')}>{tr.altWeeks || 'Alt. weeks (A start)'}</button>
        <button type="button" className="btn ghost sm" onClick={() => planAlternateWeeks('B')}>{tr.altWeeksB || 'Alt. weeks (B start)'}</button>
        <button type="button" className="btn ghost sm" onClick={() => planEveryOtherWeekend('A')}>{tr.weekendA || 'Every other weekend A'}</button>
        <button type="button" className="btn ghost sm" onClick={() => planWholeMonth('A')}>{tr.monthA || 'Whole month A'}</button>
        <button type="button" className="btn ghost sm" onClick={() => planWholeMonth('B')}>{tr.monthB || 'Whole month B'}</button>
        <button type="button" className="btn ghost sm" onClick={clearMonth}>{tr.clearMonth || 'Clear month'}</button>
      </div>

      {showQ && (
        <Questionnaire
          year={year}
          month={month}
          holidays={hols}
          tr={tr}
          onClose={() => setShowQ(false)}
          onApply={(plan) => {
            const next = { ...custody }
            for (const [d, who] of Object.entries(plan)) {
              const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
              next[key] = who
            }
            setCustody(next)
            setShowQ(false)
          }}
        />
      )}
      <details className="holiday-list" open>
        <summary>{tr.holidays || 'Holidays'} · {year}</summary>
        <ul>
          {Object.entries(luxHolidays(year, tr)).map(([date, name]) => (
            <li key={date}><span className="hol-date">{date.slice(8)}.{date.slice(5,7)}</span> {name}</li>
          ))}
        </ul>
      </details>

      <details className="event-details">
        <summary>{tr.addEvent || 'Add note / event'}</summary>
        <form className="add-form" onSubmit={addEvent}>
          <input placeholder={tr.eventTitle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="event">{tr.typeEvent}</option>
            <option value="handover">{tr.typeHandover}</option>
            <option value="school">{tr.typeSchool}</option>
            <option value="medical">{tr.typeMedical}</option>
          </select>
          <button className="btn primary" type="submit"><Plus size={16} /> {tr.add}</button>
        </form>
        <div className="event-mini">
          {events.filter(ev => ev.date && ev.date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)).map(ev => (
            <div key={ev.id} className="mini-ev">
              <span>{ev.date.slice(8)} · {ev.title}</span>
              <button type="button" onClick={() => removeEvent(ev.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
function ExpensesView() {
  const { tr } = useLang()
  const [items, setItems] = useState(() => load('cp-expenses', []))
  const [form, setForm] = useState({ desc: '', amount: '', paidBy: 'A', split: '50' })
  useEffect(() => { save('cp-expenses', items) }, [items])
  const add = (e) => { e.preventDefault(); const amt = parseFloat(form.amount); if (!form.desc || isNaN(amt) || amt <= 0) return; setItems((p) => [...p, { id: Date.now(), ...form, amount: amt }]); setForm({ desc: '', amount: '', paidBy: 'A', split: '50' }) }
  const remove = (id) => setItems((p) => p.filter((x) => x.id !== id))
  const balance = useMemo(() => {
    let a = 0, b = 0
    for (const it of items) {
      const shareA = it.split === '50' ? it.amount / 2 : it.split === 'A' ? it.amount : 0
      const shareB = it.amount - shareA
      if (it.paidBy === 'A') { a += it.amount; b -= shareB } else { b += it.amount; a -= shareA }
    }
    return { a, b }
  }, [items])
  return (
    <div className="app-panel">
      <div className="panel-head">
        <h2>{tr.expTitle}</h2>
        <div className="balance-pill">
          <span>A: {balance.a >= 0 ? '+' : ''}{balance.a.toFixed(2)}</span>
          <span>B: {balance.b >= 0 ? '+' : ''}{balance.b.toFixed(2)}</span>
        </div>
      </div>
      <div className="expense-list">
        {items.length === 0 && <p className="empty">{tr.noExp}</p>}
        {items.map((it) => (
          <div key={it.id} className="expense-row">
            <div>
              <strong>{it.desc}</strong>
              <span className="meta">{tr.paidBy} {it.paidBy} · {tr.split} {it.split === '50' ? '50/50' : it.split === 'A' ? '100% A' : '100% B'}</span>
            </div>
            <div className="amt">{it.amount.toFixed(2)}</div>
            <button className="btn ghost" type="button" onClick={() => remove(it.id)}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      <form className="add-form" onSubmit={add}>
        <input placeholder={tr.desc} value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
        <input type="number" step="0.01" placeholder={tr.amount} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <select value={form.paidBy} onChange={(e) => setForm({ ...form, paidBy: e.target.value })}>
          <option value="A">{tr.paidA}</option>
          <option value="B">{tr.paidB}</option>
        </select>
        <select value={form.split} onChange={(e) => setForm({ ...form, split: e.target.value })}>
          <option value="50">{tr.split50}</option>
          <option value="A">{tr.splitA}</option>
          <option value="B">{tr.splitB}</option>
        </select>
        <button className="btn primary" type="submit"><Plus size={16} /> {tr.add}</button>
      </form>
    </div>
  )
}

function Placeholder({ title, text }) { return (<div className="app-panel"><h2>{title}</h2><p className="empty">{text}</p></div>) }

function AppShell({ onExit }) {
  const { tr } = useLang()
  const [tab, setTab] = useState('calendar')
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand"><Heart size={18} /> {tr.appTitle}</div>
        <nav className="app-tabs">
          <button className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}><Calendar size={16} /> {tr.tabCal}</button>
          <button className={tab === 'expenses' ? 'active' : ''} onClick={() => setTab('expenses')}><Wallet size={16} /> {tr.tabExp}</button>
          <button className={tab === 'messages' ? 'active' : ''} onClick={() => setTab('messages')}><MessageSquare size={16} /> {tr.tabMsg}</button>
          <button className={tab === 'docs' ? 'active' : ''} onClick={() => setTab('docs')}><FileText size={16} /> {tr.tabDoc}</button>
        </nav>
        <LangSwitch />
        <button className="btn ghost" type="button" onClick={onExit}><Home size={16} /> {tr.back}</button>
      </header>
      <main className="app-main">
        {tab === 'calendar' && <CalendarView />}
        {tab === 'expenses' && <ExpensesView />}
        {tab === 'messages' && <Placeholder title={tr.msgTitle} text={tr.msgText} />}
        {tab === 'docs' && <Placeholder title={tr.docTitle} text={tr.docText} />}
      </main>
    </div>
  )
}

function Landing({ onEnter }) {
  const { tr } = useLang()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => { document.body.style.overflow = menuOpen ? 'hidden' : ''; return () => { document.body.style.overflow = '' } }, [menuOpen])
  const closeMenu = () => setMenuOpen(false)
  const features = [
    { Icon: IconCalendar, title: tr.feat1t, text: tr.feat1 },
    { Icon: IconWallet, title: tr.feat2t, text: tr.feat2 },
    { Icon: IconMessages, title: tr.feat3t, text: tr.feat3 },
    { Icon: IconDocs, title: tr.feat4t, text: tr.feat4 },
  ]
  const friction = [
    { Icon: IconHandover, title: tr.f1t, text: tr.f1 },
    { Icon: IconExpense, title: tr.f2t, text: tr.f2 },
    { Icon: IconEscalate, title: tr.f3t, text: tr.f3 },
    { Icon: IconScatter, title: tr.f4t, text: tr.f4 },
  ]
  const steps = [
    { n: '01', title: tr.s1t, text: tr.s1 },
    { n: '02', title: tr.s2t, text: tr.s2 },
    { n: '03', title: tr.s3t, text: tr.s3 },
    { n: '04', title: tr.s4t, text: tr.s4 },
    { n: '05', title: tr.s5t, text: tr.s5 },
  ]
  const fiscalCards = [
    { title: tr.fc1t, body: tr.fc1 }, { title: tr.fc2t, body: tr.fc2 },
    { title: tr.fc3t, body: tr.fc3 }, { title: tr.fc4t, body: tr.fc4 },
    { title: tr.fc5t, body: tr.fc5 }, { title: tr.fc6t, body: tr.fc6 },
  ]
  return (
    <div className="site">
      <header className={`nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-inner">
          <a className="logo" href="#top" onClick={closeMenu}><span className="logo-mark"><Heart size={16} strokeWidth={2.4} /></span>CoParents</a>
          <nav className="nav-links" aria-label="Primary">
            <a href="#problem">{tr.problem}</a>
            <a href="#solution">{tr.how}</a>
            <a href="#how">{tr.works}</a>
            <a href="#fiscal">{tr.fiscal}</a>
          </nav>
          <div className="nav-actions">
            <LangSwitch />
            <button className="btn ghost" type="button" onClick={onEnter}>{tr.demo}</button>
            <button className="btn primary" type="button" onClick={onEnter}>{tr.enter}</button>
          </div>
          <button className="menu-btn" type="button" aria-label={menuOpen ? 'Close' : 'Open'} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
        </div>
        {menuOpen && (
          <div className="mobile-menu">
            <a href="#problem" onClick={closeMenu}>{tr.problem}</a>
            <a href="#solution" onClick={closeMenu}>{tr.how}</a>
            <a href="#how" onClick={closeMenu}>{tr.works}</a>
            <a href="#fiscal" onClick={closeMenu}>{tr.fiscal}</a>
            <div style={{ padding: '8px 0' }}><LangSwitch /></div>
            <button className="btn primary full" type="button" onClick={() => { closeMenu(); onEnter() }}>{tr.enter}</button>
          </div>
        )}
      </header>
      <main id="top">
        <section className="hero">
          <div className="hero-bg" aria-hidden="true"><div className="orb orb-a" /><div className="orb orb-b" /><div className="grid-fade" /></div>
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow"><Sparkles size={13} />{tr.eyebrow}</div>
              <h1>{tr.h1a}<span className="h1-line">{tr.h1b}</span></h1>
              <p className="lead">{tr.lead}</p>
              <div className="hero-cta">
                <button className="btn primary large" type="button" onClick={onEnter}>{tr.enter}<ArrowRight size={18} /></button>
                <a className="btn text" href="#solution">{tr.see}</a>
              </div>
              <div className="hero-trust">
                <span><Shield size={15} />{tr.trust1}</span>
                <span><Users size={15} />{tr.trust2}</span>
                <span><Clock size={15} />{tr.trust3}</span>
              </div>
            </div>
            <div className="hero-visual" aria-hidden="true"><HeroArt /></div>
          </div>
        </section>
        <section className="section problem" id="problem">
          <div className="container">
            <div className="problem-head">
              <div className="section-label">{tr.frictionLabel}</div>
              <h2>{tr.frictionH2a}<br />{tr.frictionH2b}</h2>
              <p className="section-lead">{tr.frictionLead}</p>
            </div>
            <div className="friction-grid">
              {friction.map(({ Icon, title, text }) => (
                <article className="friction-card" key={title}><div className="friction-icon custom"><Icon /></div><h3>{title}</h3><p>{text}</p></article>
              ))}
            </div>
          </div>
        </section>
        <section className="section solution" id="solution">
          <div className="container">
            <div className="section-header center">
              <div className="section-label">{tr.solLabel}</div>
              <h2>{tr.solH2a}<br />{tr.solH2b}</h2>
              <p className="section-lead">{tr.solLead}</p>
            </div>
            <div className="feature-grid">
              {features.map(({ Icon, title, text }, i) => (
                <article className="feature" key={title}><div className="feature-top"><div className="feature-icon custom"><Icon /></div><span className="feature-n">0{i + 1}</span></div><h3>{title}</h3><p>{text}</p></article>
              ))}
            </div>
          </div>
        </section>
        <section className="section how" id="how">
          <div className="container">
            <div className="section-header center">
              <div className="section-label">{tr.howLabel}</div>
              <h2>{tr.howH2}</h2>
              <p className="section-lead">{tr.howLead}</p>
            </div>
            <div className="steps steps-5">
              {steps.map((s, i) => (
                <article className="step" key={s.n}><div className="step-rail"><span className="step-n">{s.n}</span>{i < steps.length - 1 && <span className="step-line" />}</div><h3>{s.title}</h3><p>{s.text}</p></article>
              ))}
            </div>
          </div>
        </section>
        <section className="section fiscal" id="fiscal">
          <div className="container">
            <div className="section-header center">
              <div className="section-label">{tr.fiscLabel}</div>
              <h2>{tr.fiscH2}</h2>
              <p className="section-lead">{tr.fiscLead}</p>
            </div>
            <div className="fiscal-banner"><Info size={18} /><p><strong>Timeline:</strong> {tr.fiscBanner}</p></div>
            <div className="fiscal-grid">{fiscalCards.map((c) => (<article className="fiscal-card" key={c.title}><h3>{c.title}</h3><p>{c.body}</p></article>))}</div>
            <div className="fiscal-note"><HelpCircle size={16} /><p>{tr.fiscNote}</p></div>
          </div>
        </section>
        <section className="section values">
          <div className="container values-panel">
            <div className="values-copy">
              <div className="section-label">{tr.valLabel}</div>
              <h2>{tr.valH2a}<br />{tr.valH2b}</h2>
              <p>{tr.valP}</p>
              <div className="values-art-wrap"><ValuesArt /></div>
            </div>
            <ul className="value-list">
              <li><span className="value-check"><Check size={16} /></span><div><strong>{tr.v1t}</strong><span>{tr.v1}</span></div></li>
              <li><span className="value-check"><Check size={16} /></span><div><strong>{tr.v2t}</strong><span>{tr.v2}</span></div></li>
              <li><span className="value-check"><Check size={16} /></span><div><strong>{tr.v3t}</strong><span>{tr.v3}</span></div></li>
            </ul>
          </div>
        </section>
        <section className="section cta">
          <div className="container">
            <div className="cta-box">
              <div className="cta-glow" aria-hidden="true" />
              <h2>{tr.ctaH2}</h2>
              <p>{tr.ctaP}</p>
              <button className="btn primary large light" type="button" onClick={onEnter}>{tr.enter}<ArrowRight size={18} /></button>
              <p className="cta-note">{tr.ctaNote}</p>
            </div>
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-brand"><span className="logo-mark small"><Heart size={13} strokeWidth={2.4} /></span>CoParents</div>
          <p>{tr.footerTag}</p>
          <span className="footer-meta">© {new Date().getFullYear()} {tr.footerMeta}</span>
        </div>
      </footer>
    </div>
  )
}

function App() {
  const [mode, setMode] = useState('landing')
  if (mode === 'app') return <AppShell onExit={() => setMode('landing')} />
  return <Landing onEnter={() => setMode('app')} />
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LangProvider><App /></LangProvider>
  </React.StrictMode>
)

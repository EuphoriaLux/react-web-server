// Privacy notice and account screen, in the app's four languages.
// The notice is a plain-language draft. Have it read by a lawyer before a public launch.

// Who runs CoParents. Shown in the notice. Change here only.
export const PRIVACY_CONTACT = {
  name: 'Tom',
  email: 'privacy@coparent.lu',
}
export const PRIVACY_UPDATED = '2026-11-21'

export const PRIVACY_COPY = {
  en: {
    ui: {
      privacy: 'Privacy',
      account: 'Privacy & account',
      signInNote: 'We use your email only to sign you in.',
      notice: 'Privacy notice',
      signedInAs: 'Signed in as {email}',
      download: 'Download my data',
      downloadHint: 'One file with your account, the shared plan, its notes and receipt photos.',
      downloadFailed: 'The download did not work. Try again in a moment.',
      deleteTitle: 'Delete my account',
      deleteLead: 'This happens at once and cannot be undone.',
      deleteKept: 'If the other parent has joined, the shared plan stays with them, with what you both entered. Its code changes, so your old code stops working.',
      deleteGone: 'If you are the only parent in it, the plan is deleted with everything in it.',
      deleteBackup: 'Nightly backups are deleted on their own within 14 days.',
      typeEmail: 'Type {email} to confirm',
      deleteButton: 'Delete my account',
      deleting: 'Deleting…',
      deletedKept: 'Your account is deleted. The shared plan stays with the other parent.',
      deletedGone: 'Your account and your plan are deleted.',
      deletedNone: 'Your account is deleted.',
      close: 'Close',
      back: 'Back',
      updated: 'Last updated {date}',
    },
    title: 'Privacy notice',
    lead: 'CoParents helps two separated parents share one plan for their children. This page explains in plain words what we store, why, who helps us run the service, and how you delete it.',
    sections: [
      {
        h: 'Who is responsible',
        p: ['CoParents is run by {name}, a private individual in Luxembourg, who is responsible for your data (the "controller"). For any question or request about your data, write to {email}.'],
      },
      {
        h: 'What we store',
        list: [
          'Your account: your email address, the date you signed up, and your sign-in session (a random code in a cookie, valid 60 days).',
          'Your shared plan: what you and the other parent enter. That is the calendar and handovers, expenses (with dates and categories), payments into a shared account or child support payments and their dates, an agreed budget, messages and notes, document titles and notes, and the family details from the setup questions (children\'s first names and year of birth, crèche, maison relais or school, activities, how care is shared).',
          'Health notes, only if you write one. This is health information about your child, which the law protects more strictly. Write only what the other parent and caregivers need to know day to day.',
          'Receipt photos, only if you add one to an expense. Your phone makes the photo smaller and removes its location data before sending it. A receipt can show a shop, an address or the last digits of a card.',
          'Server logs: the network (IP) address, time and address of each request, to keep the service safe and fix faults.',
          'On your phone or computer: the app keeps a copy of your plan and your language in the browser, so it also works offline.',
        ],
      },
      {
        h: 'Why we use it',
        list: [
          'To give you the service you signed up for: sign you in, keep the shared plan and sync it between both parents (GDPR article 6(1)(b)).',
          'Health notes: your explicit consent, which you give by writing the note (article 9(2)(a)). You can delete the note at any time.',
          'Server logs and limits on sign-in attempts: our legitimate interest in keeping accounts safe (article 6(1)(f)).',
          'We do not sell your data, show ads, track you or use analytics.',
        ],
      },
      {
        h: 'Children',
        p: ['Children do not use CoParents. Parents enter details about their own children to organise their care. Enter only what is useful, and remember that the other parent sees everything in the shared plan.'],
      },
      {
        h: 'Who can see it',
        list: [
          'The other parent in your shared plan sees everything in it, including what you wrote.',
          'Companies that run parts of the service for us: Oracle Cloud Infrastructure hosts the server and database in Frankfurt, Germany. Brevo (Paris, France) sends the sign-in emails, so it receives your email address. Microsoft 365 holds the mailbox for emails you send to {email}.',
          'Nobody else, unless the law requires it. Your data is stored in the European Union. The app and its fonts load from our own server, so no other company sees your visit.',
        ],
      },
      {
        h: 'How long we keep it',
        list: [
          'Your account and plan: as long as your account exists.',
          'Sign-in links: deleted a day after they expire. Sessions end after 60 days or when you sign out.',
          'Server logs: about 14 days.',
          'Receipt photos: until either parent removes the photo or its expense, or the plan is deleted. A photo no expense points at any more is deleted from the server within 7 days.',
          'Backups: a copy of the database is made every night and kept 14 days on the same server, so deleted data leaves the backups within 14 days. If we ever have to restore a backup, we delete again the accounts deleted since.',
        ],
      },
      {
        h: 'Deleting your account',
        p: ['In the app, open Privacy & account, type your email address and confirm. It happens at once:'],
        list: [
          'Your account, your email address and your sessions are deleted.',
          'If the other parent is still in the plan, the plan stays with them, because it is their record too. It keeps what you both entered, including your messages and your name as written in the plan. The invite code changes. If you want something you wrote removed, ask the other parent or write to us.',
          'If you are the only parent in the plan, the plan and everything in it are deleted.',
          'The copy in your browser is removed on that device at once, and on your other devices the next time they open the app.',
        ],
      },
      {
        h: 'Your rights',
        p: [
          'You can ask to see, correct, download or delete your data, to limit or object to how we use it, and to withdraw your consent for health notes. You can download a copy yourself under Privacy & account and change most things directly in the app. For anything else, write to {email}. We answer within one month.',
          'You can also complain to Luxembourg\'s data protection authority, the CNPD (cnpd.public.lu).',
        ],
      },
      {
        h: 'Cookies',
        p: ['We use one cookie, which keeps you signed in. The service cannot work without it, so we do not ask for consent. There are no advertising or analytics cookies.'],
      },
      {
        h: 'Security',
        p: ['The site only works over an encrypted connection. You sign in with a link that works once and expires after 15 minutes, so there is no password to steal. The database can only be reached from the server itself. Your plan is also on your phone, so keep your phone locked.'],
      },
      {
        h: 'Changes',
        p: ['If we change this notice, we update the date at the top. We tell you in the app about important changes.'],
      },
    ],
  },

  fr: {
    ui: {
      privacy: 'Confidentialité',
      account: 'Confidentialité et compte',
      signInNote: 'Votre e-mail sert uniquement à vous connecter.',
      notice: 'Politique de confidentialité',
      signedInAs: 'Connecté avec {email}',
      download: 'Télécharger mes données',
      downloadHint: 'Un fichier avec votre compte, le planning partagé, ses notes et les photos de tickets.',
      downloadFailed: 'Le téléchargement n’a pas fonctionné. Réessayez dans un instant.',
      deleteTitle: 'Supprimer mon compte',
      deleteLead: 'La suppression est immédiate et définitive.',
      deleteKept: 'Si l’autre parent a rejoint le planning, celui-ci reste chez lui, avec ce que vous avez saisi tous les deux. Son code change, votre ancien code ne fonctionne plus.',
      deleteGone: 'Si vous êtes le seul parent du planning, il est supprimé avec tout son contenu.',
      deleteBackup: 'Les sauvegardes nocturnes s’effacent d’elles-mêmes sous 14 jours.',
      typeEmail: 'Tapez {email} pour confirmer',
      deleteButton: 'Supprimer mon compte',
      deleting: 'Suppression…',
      deletedKept: 'Votre compte est supprimé. Le planning partagé reste chez l’autre parent.',
      deletedGone: 'Votre compte et votre planning sont supprimés.',
      deletedNone: 'Votre compte est supprimé.',
      close: 'Fermer',
      back: 'Retour',
      updated: 'Dernière mise à jour : {date}',
    },
    title: 'Politique de confidentialité',
    lead: 'CoParents aide deux parents séparés à partager un même planning pour leurs enfants. Cette page explique simplement ce que nous enregistrons, pourquoi, qui nous aide à faire fonctionner le service, et comment tout supprimer.',
    sections: [
      {
        h: 'Qui est responsable',
        p: ['CoParents est exploité par {name}, particulier au Luxembourg, responsable de vos données (le « responsable du traitement »). Pour toute question ou demande sur vos données, écrivez à {email}.'],
      },
      {
        h: 'Ce que nous enregistrons',
        list: [
          'Votre compte : votre adresse e-mail, la date d’inscription et votre session de connexion (un code aléatoire dans un cookie, valable 60 jours).',
          'Votre planning partagé : ce que vous et l’autre parent saisissez. C’est-à-dire le calendrier et les passages de relais, les dépenses (avec date et catégorie), les versements sur un compte commun ou de pension alimentaire et leurs dates, un budget convenu, les messages et notes, les titres et notes de documents, et les informations familiales des questions d’accueil (prénoms et année de naissance des enfants, crèche, maison relais ou école, activités, organisation de la garde).',
          'Les notes de santé, seulement si vous en écrivez une. Ce sont des données de santé sur votre enfant, que la loi protège plus strictement. N’écrivez que ce que l’autre parent et les personnes qui s’occupent de l’enfant doivent savoir au quotidien.',
          'Les photos de tickets, seulement si vous en ajoutez une à une dépense. Votre téléphone réduit la photo et retire sa localisation avant l’envoi. Un ticket peut montrer un magasin, une adresse ou les derniers chiffres d’une carte.',
          'Les journaux du serveur : l’adresse réseau (IP), l’heure et l’adresse de chaque requête, pour sécuriser le service et corriger les pannes.',
          'Sur votre téléphone ou ordinateur : l’application garde une copie de votre planning et votre langue dans le navigateur, pour fonctionner aussi hors ligne.',
        ],
      },
      {
        h: 'Pourquoi nous les utilisons',
        list: [
          'Pour vous fournir le service auquel vous vous êtes inscrit : vous connecter, conserver le planning partagé et le synchroniser entre les deux parents (RGPD article 6(1)(b)).',
          'Notes de santé : votre consentement explicite, que vous donnez en écrivant la note (article 9(2)(a)). Vous pouvez supprimer la note à tout moment.',
          'Journaux du serveur et limites de tentatives de connexion : notre intérêt légitime à protéger les comptes (article 6(1)(f)).',
          'Nous ne vendons pas vos données, n’affichons pas de publicité, ne vous suivons pas et n’utilisons pas d’outil d’analyse d’audience.',
        ],
      },
      {
        h: 'Les enfants',
        p: ['Les enfants n’utilisent pas CoParents. Les parents saisissent des informations sur leurs propres enfants pour organiser leur prise en charge. Ne saisissez que l’utile, et rappelez-vous que l’autre parent voit tout le contenu du planning partagé.'],
      },
      {
        h: 'Qui peut les voir',
        list: [
          'L’autre parent de votre planning partagé voit tout son contenu, y compris ce que vous avez écrit.',
          'Des sociétés font fonctionner une partie du service pour nous : Oracle Cloud Infrastructure héberge le serveur et la base de données à Francfort (Allemagne). Brevo (Paris, France) envoie les e-mails de connexion et reçoit donc votre adresse e-mail. Microsoft 365 héberge la boîte qui reçoit les e-mails envoyés à {email}.',
          'Personne d’autre, sauf obligation légale. Vos données sont stockées dans l’Union européenne. L’application et ses polices se chargent depuis notre propre serveur : aucune autre société ne voit votre visite.',
        ],
      },
      {
        h: 'Combien de temps nous les gardons',
        list: [
          'Votre compte et votre planning : tant que votre compte existe.',
          'Liens de connexion : supprimés un jour après leur expiration. Les sessions prennent fin après 60 jours ou à la déconnexion.',
          'Journaux du serveur : environ 14 jours.',
          'Photos de tickets : jusqu’à ce qu’un des parents supprime la photo ou sa dépense, ou que le planning soit supprimé. Une photo qui n’est plus liée à aucune dépense est effacée du serveur sous 7 jours.',
          'Sauvegardes : une copie de la base de données est faite chaque nuit et gardée 14 jours sur le même serveur. Les données supprimées disparaissent donc des sauvegardes sous 14 jours. Si nous devions un jour restaurer une sauvegarde, nous supprimerions à nouveau les comptes supprimés depuis.',
        ],
      },
      {
        h: 'Supprimer votre compte',
        p: ['Dans l’application, ouvrez Confidentialité et compte, tapez votre adresse e-mail et confirmez. C’est immédiat :'],
        list: [
          'Votre compte, votre adresse e-mail et vos sessions sont supprimés.',
          'Si l’autre parent est encore dans le planning, celui-ci reste chez lui, car c’est aussi son dossier. Il garde ce que vous avez saisi tous les deux, y compris vos messages et votre prénom tel qu’écrit dans le planning. Le code d’invitation change. Pour faire retirer quelque chose que vous avez écrit, demandez à l’autre parent ou écrivez-nous.',
          'Si vous êtes le seul parent du planning, le planning et tout son contenu sont supprimés.',
          'La copie dans votre navigateur est effacée tout de suite sur cet appareil, et sur vos autres appareils à leur prochaine ouverture de l’application.',
        ],
      },
      {
        h: 'Vos droits',
        p: [
          'Vous pouvez demander à consulter, corriger, télécharger ou supprimer vos données, à en limiter l’usage ou à vous y opposer, et retirer votre consentement pour les notes de santé. Vous pouvez télécharger une copie vous-même dans Confidentialité et compte, et modifier la plupart des informations directement dans l’application. Pour le reste, écrivez à {email}. Nous répondons sous un mois.',
          'Vous pouvez aussi déposer une réclamation auprès de l’autorité luxembourgeoise de protection des données, la CNPD (cnpd.public.lu).',
        ],
      },
      {
        h: 'Cookies',
        p: ['Nous utilisons un seul cookie, qui vous garde connecté. Le service ne peut pas fonctionner sans lui, nous ne demandons donc pas de consentement. Il n’y a ni cookie publicitaire ni cookie de mesure d’audience.'],
      },
      {
        h: 'Sécurité',
        p: ['Le site ne fonctionne qu’en connexion chiffrée. Vous vous connectez avec un lien à usage unique valable 15 minutes : pas de mot de passe à voler. La base de données n’est accessible que depuis le serveur lui-même. Votre planning est aussi sur votre téléphone : gardez-le verrouillé.'],
      },
      {
        h: 'Modifications',
        p: ['Si nous modifions cette politique, nous mettons à jour la date en haut de page. Nous vous informons dans l’application des changements importants.'],
      },
    ],
  },

  de: {
    ui: {
      privacy: 'Datenschutz',
      account: 'Datenschutz und Konto',
      signInNote: 'Ihre E-Mail dient nur zur Anmeldung.',
      notice: 'Datenschutzhinweis',
      signedInAs: 'Angemeldet als {email}',
      download: 'Meine Daten herunterladen',
      downloadHint: 'Eine Datei mit Ihrem Konto, dem gemeinsamen Plan, seinen Notizen und Belegfotos.',
      downloadFailed: 'Der Download hat nicht funktioniert. Bitte gleich noch einmal versuchen.',
      deleteTitle: 'Mein Konto löschen',
      deleteLead: 'Das geschieht sofort und lässt sich nicht rückgängig machen.',
      deleteKept: 'Ist der andere Elternteil beigetreten, bleibt der gemeinsame Plan bei ihm, mit allem, was Sie beide eingetragen haben. Sein Code ändert sich, Ihr alter Code funktioniert nicht mehr.',
      deleteGone: 'Sind Sie der einzige Elternteil im Plan, wird er mit allem Inhalt gelöscht.',
      deleteBackup: 'Nächtliche Sicherungen löschen sich innerhalb von 14 Tagen von selbst.',
      typeEmail: 'Zur Bestätigung {email} eingeben',
      deleteButton: 'Mein Konto löschen',
      deleting: 'Wird gelöscht…',
      deletedKept: 'Ihr Konto ist gelöscht. Der gemeinsame Plan bleibt beim anderen Elternteil.',
      deletedGone: 'Ihr Konto und Ihr Plan sind gelöscht.',
      deletedNone: 'Ihr Konto ist gelöscht.',
      close: 'Schließen',
      back: 'Zurück',
      updated: 'Zuletzt aktualisiert: {date}',
    },
    title: 'Datenschutzhinweis',
    lead: 'CoParents hilft zwei getrennten Eltern, einen gemeinsamen Plan für ihre Kinder zu führen. Hier steht in einfachen Worten, was wir speichern, warum, wer uns beim Betrieb hilft und wie Sie alles löschen.',
    sections: [
      {
        h: 'Wer verantwortlich ist',
        p: ['CoParents wird von {name} betrieben, einer Privatperson in Luxemburg, die für Ihre Daten verantwortlich ist (der „Verantwortliche“). Für Fragen oder Anfragen zu Ihren Daten schreiben Sie an {email}.'],
      },
      {
        h: 'Was wir speichern',
        list: [
          'Ihr Konto: Ihre E-Mail-Adresse, das Datum der Anmeldung und Ihre Sitzung (ein Zufallscode in einem Cookie, 60 Tage gültig).',
          'Ihr gemeinsamer Plan: was Sie und der andere Elternteil eintragen. Das sind Kalender und Übergaben, Ausgaben (mit Datum und Kategorie), Einzahlungen auf ein gemeinsames Konto oder Unterhaltszahlungen und ihre Daten, ein vereinbartes Budget, Nachrichten und Notizen, Titel und Notizen von Dokumenten sowie die Familienangaben aus den Einstiegsfragen (Vornamen und Geburtsjahr der Kinder, Crèche, Maison relais oder Schule, Aktivitäten, Aufteilung der Betreuung).',
          'Gesundheitsnotizen, nur wenn Sie eine schreiben. Das sind Gesundheitsdaten Ihres Kindes, die das Gesetz besonders schützt. Schreiben Sie nur, was der andere Elternteil und Betreuungspersonen im Alltag wissen müssen.',
          'Belegfotos, nur wenn Sie eines zu einer Ausgabe hinzufügen. Ihr Telefon verkleinert das Foto und entfernt den Standort, bevor es gesendet wird. Ein Beleg kann ein Geschäft, eine Adresse oder die letzten Ziffern einer Karte zeigen.',
          'Server-Protokolle: Netzwerkadresse (IP), Zeit und Adresse jeder Anfrage, um den Dienst zu schützen und Fehler zu beheben.',
          'Auf Ihrem Telefon oder Computer: Die App speichert eine Kopie Ihres Plans und Ihre Sprache im Browser, damit sie auch offline funktioniert.',
        ],
      },
      {
        h: 'Wozu wir sie nutzen',
        list: [
          'Um Ihnen den Dienst zu liefern, für den Sie sich angemeldet haben: Anmeldung, gemeinsamer Plan und dessen Abgleich zwischen beiden Eltern (DSGVO Artikel 6 Abs. 1 b).',
          'Gesundheitsnotizen: Ihre ausdrückliche Einwilligung, die Sie mit dem Schreiben der Notiz geben (Artikel 9 Abs. 2 a). Sie können die Notiz jederzeit löschen.',
          'Server-Protokolle und Grenzen für Anmeldeversuche: unser berechtigtes Interesse, Konten zu schützen (Artikel 6 Abs. 1 f).',
          'Wir verkaufen Ihre Daten nicht, zeigen keine Werbung, verfolgen Sie nicht und nutzen keine Webanalyse.',
        ],
      },
      {
        h: 'Kinder',
        p: ['Kinder nutzen CoParents nicht. Eltern tragen Angaben zu ihren eigenen Kindern ein, um deren Betreuung zu organisieren. Tragen Sie nur Nützliches ein und denken Sie daran, dass der andere Elternteil alles im gemeinsamen Plan sieht.'],
      },
      {
        h: 'Wer sie sehen kann',
        list: [
          'Der andere Elternteil in Ihrem gemeinsamen Plan sieht alles darin, auch was Sie geschrieben haben.',
          'Unternehmen, die Teile des Dienstes für uns betreiben: Oracle Cloud Infrastructure stellt Server und Datenbank in Frankfurt (Deutschland) bereit. Brevo (Paris, Frankreich) versendet die Anmelde-E-Mails und erhält dafür Ihre E-Mail-Adresse. Microsoft 365 stellt das Postfach für E-Mails an {email} bereit.',
          'Sonst niemand, außer das Gesetz verlangt es. Ihre Daten werden in der Europäischen Union gespeichert. App und Schriften laden von unserem eigenen Server, kein anderes Unternehmen sieht Ihren Besuch.',
        ],
      },
      {
        h: 'Wie lange wir sie aufbewahren',
        list: [
          'Ihr Konto und Ihr Plan: solange Ihr Konto besteht.',
          'Anmeldelinks: einen Tag nach Ablauf gelöscht. Sitzungen enden nach 60 Tagen oder beim Abmelden.',
          'Server-Protokolle: etwa 14 Tage.',
          'Belegfotos: bis ein Elternteil das Foto oder seine Ausgabe entfernt oder der Plan gelöscht wird. Ein Foto, das zu keiner Ausgabe mehr gehört, wird innerhalb von 7 Tagen vom Server gelöscht.',
          'Sicherungen: Jede Nacht wird eine Kopie der Datenbank erstellt und 14 Tage auf demselben Server aufbewahrt. Gelöschte Daten verschwinden also innerhalb von 14 Tagen aus den Sicherungen. Müssten wir je eine Sicherung zurückspielen, löschen wir die seither gelöschten Konten erneut.',
        ],
      },
      {
        h: 'Ihr Konto löschen',
        p: ['Öffnen Sie in der App „Datenschutz und Konto“, geben Sie Ihre E-Mail-Adresse ein und bestätigen Sie. Das geschieht sofort:'],
        list: [
          'Ihr Konto, Ihre E-Mail-Adresse und Ihre Sitzungen werden gelöscht.',
          'Ist der andere Elternteil noch im Plan, bleibt der Plan bei ihm, denn er ist auch seine Unterlage. Er behält, was Sie beide eingetragen haben, auch Ihre Nachrichten und Ihren Namen, wie er im Plan steht. Der Einladungscode ändert sich. Soll etwas, das Sie geschrieben haben, entfernt werden, fragen Sie den anderen Elternteil oder schreiben Sie uns.',
          'Sind Sie der einzige Elternteil im Plan, werden der Plan und sein ganzer Inhalt gelöscht.',
          'Die Kopie in Ihrem Browser wird auf diesem Gerät sofort entfernt, auf Ihren anderen Geräten beim nächsten Öffnen der App.',
        ],
      },
      {
        h: 'Ihre Rechte',
        p: [
          'Sie können verlangen, Ihre Daten einzusehen, zu berichtigen, herunterzuladen oder zu löschen, ihre Nutzung einzuschränken oder ihr zu widersprechen, und Ihre Einwilligung für Gesundheitsnotizen widerrufen. Eine Kopie laden Sie selbst unter „Datenschutz und Konto“ herunter, das meiste ändern Sie direkt in der App. Für alles andere schreiben Sie an {email}. Wir antworten innerhalb eines Monats.',
          'Sie können sich auch bei der luxemburgischen Datenschutzbehörde CNPD beschweren (cnpd.public.lu).',
        ],
      },
      {
        h: 'Cookies',
        p: ['Wir verwenden ein einziges Cookie, das Sie angemeldet hält. Ohne es funktioniert der Dienst nicht, daher fragen wir nicht nach einer Einwilligung. Es gibt keine Werbe- oder Analyse-Cookies.'],
      },
      {
        h: 'Sicherheit',
        p: ['Die Seite funktioniert nur über eine verschlüsselte Verbindung. Sie melden sich mit einem Link an, der einmal funktioniert und nach 15 Minuten abläuft, es gibt also kein Passwort zu stehlen. Die Datenbank ist nur vom Server selbst erreichbar. Ihr Plan liegt auch auf Ihrem Telefon, halten Sie es gesperrt.'],
      },
      {
        h: 'Änderungen',
        p: ['Ändern wir diesen Hinweis, aktualisieren wir das Datum oben. Über wichtige Änderungen informieren wir Sie in der App.'],
      },
    ],
  },

  lb: {
    ui: {
      privacy: 'Dateschutz',
      account: 'Dateschutz a Kont',
      signInNote: 'Är E-Mail déngt just fir Iech unzemellen.',
      notice: 'Dateschutzerklärung',
      signedInAs: 'Ugemellt als {email}',
      download: 'Meng Daten eroflueden',
      downloadHint: 'Ee Fichier mat Ärem Kont, dem gemeinsame Plang, sengen Notizen an de Fotoe vu Bongen.',
      downloadFailed: 'Den Download huet net funktionéiert. Probéiert et gläich nach eng Kéier.',
      deleteTitle: 'Mäi Kont läschen',
      deleteLead: 'Dat geschitt direkt a kann net réckgängeg gemaach ginn.',
      deleteKept: 'Wann deen aneren Elterendeel bäigetrueden ass, bleift de gemeinsame Plang bei him, mat allem, wat Dir allebéid agedroen hutt. De Code ännert sech, Ären ale Code funktionéiert net méi.',
      deleteGone: 'Wann Dir deen eenzegen Elterendeel am Plang sidd, gëtt e mat sengem ganzen Inhalt geläscht.',
      deleteBackup: 'Déi nuetslech Sécherunge läsche sech bannent 14 Deeg vu selwer.',
      typeEmail: 'Fir ze confirméieren {email} aginn',
      deleteButton: 'Mäi Kont läschen',
      deleting: 'Gëtt geläscht…',
      deletedKept: 'Äre Kont ass geläscht. De gemeinsame Plang bleift beim aneren Elterendeel.',
      deletedGone: 'Äre Kont an Äre Plang si geläscht.',
      deletedNone: 'Äre Kont ass geläscht.',
      close: 'Zoumaachen',
      back: 'Zréck',
      updated: 'Lescht Aktualiséierung: {date}',
    },
    title: 'Dateschutzerklärung',
    lead: 'CoParents hëlleft zwee getrennten Elteren, ee gemeinsame Plang fir hir Kanner ze féieren. Hei steet an einfache Wierder, wat mir späicheren, firwat, wien eis beim Betrib hëlleft, a wéi Dir alles läscht.',
    sections: [
      {
        h: 'Wie verantwortlech ass',
        p: ['CoParents gëtt vum {name} bedriwwen, enger Privatpersoun zu Lëtzebuerg, déi fir Är Daten verantwortlech ass (de „Verantwortlechen“). Fir all Fro oder Ufro zu Ären Daten, schreift un {email}.'],
      },
      {
        h: 'Wat mir späicheren',
        list: [
          'Äre Kont: Är E-Mail-Adress, den Datum vun der Umeldung an Är Sessioun (en Zoufallscode an engem Cookie, 60 Deeg gülteg).',
          'Äre gemeinsame Plang: wat Dir an deen aneren Elterendeel aginn. Dat sinn de Kalenner an d’Iwwergaben, d’Ausgaben (mat Datum a Kategorie), d’Iwwerweisungen op e gemeinsame Kont oder vun der Pensioun alimentaire an hir Datumen, en ofgemaachte Budget, d’Messagen an Notizen, Titelen an Notizen vun Dokumenter, an d’Familljeninformatiounen aus den Ufanksfroen (Virnimm a Gebuertsjoer vun de Kanner, Crèche, Maison relais oder Schoul, Aktivitéiten, wéi d’Betreiung opgedeelt ass).',
          'Gesondheetsnotizen, just wann Dir eng schreift. Dat si Gesondheetsdaten iwwer Äert Kand, déi d’Gesetz besonnesch schützt. Schreift just dat, wat deen aneren Elterendeel an d’Betreiungspersounen am Alldag musse wëssen.',
          'Fotoe vu Bongen, just wann Dir eng bei eng Ausgab derbäisetzt. Ären Telefon mécht d’Foto méi kleng an hëlt de Standuert ewech, ier se geschéckt gëtt. E Bong kann e Geschäft, eng Adress oder déi lescht Zifferen vun enger Kaart weisen.',
          'Server-Protokoller: d’Netzwierkadress (IP), d’Zäit an d’Adress vun all Ufro, fir de Service ze schützen a Feeler ze flécken.',
          'Op Ärem Telefon oder Computer: d’App hält eng Kopie vun Ärem Plang an Är Sprooch am Browser, sou datt se och offline funktionéiert.',
        ],
      },
      {
        h: 'Firwat mir se notzen',
        list: [
          'Fir Iech de Service ze liwweren, fir deen Dir Iech ugemellt hutt: Iech umellen, de gemeinsame Plang halen an tëscht béiden Elteren ofgläichen (DSGVO Artikel 6(1)(b)).',
          'Gesondheetsnotizen: Är ausdrécklech Awëllegung, déi Dir gitt, andeems Dir d’Notiz schreift (Artikel 9(2)(a)). Dir kënnt d’Notiz zu all Moment läschen.',
          'Server-Protokoller a Limitte fir Umeldeversich: eist berechtegt Interessi, d’Konte ze schützen (Artikel 6(1)(f)).',
          'Mir verkafen Är Daten net, weise keng Reklamm, verfollegen Iech net a benotze keng Webanalyse.',
        ],
      },
      {
        h: 'Kanner',
        p: ['Kanner benotzen CoParents net. Elteren droen Informatiounen iwwer hir eege Kanner an, fir hir Betreiung ze organiséieren. Gitt just dat an, wat nëtzlech ass, a denkt drun, datt deen aneren Elterendeel alles am gemeinsame Plang gesäit.'],
      },
      {
        h: 'Wien se gesi kann',
        list: [
          'Deen aneren Elterendeel an Ärem gemeinsame Plang gesäit alles dran, och dat, wat Dir geschriwwen hutt.',
          'Firmen, déi Deeler vum Service fir eis bedreiwen: Oracle Cloud Infrastructure stellt de Server an d’Datebank zu Frankfurt (Däitschland). Brevo (Paräis, Frankräich) schéckt d’Umeldungs-E-Mailen a kritt doduerch Är E-Mail-Adress. Microsoft 365 stellt d’Postfach fir E-Mailen un {email}.',
          'Soss keen, ausser d’Gesetz verlaangt et. Är Daten ginn an der Europäescher Unioun gespäichert. D’App an hir Schrëften lueden vun eisem eegene Server, keng aner Firma gesäit Äre Besuch.',
        ],
      },
      {
        h: 'Wéi laang mir se halen',
        list: [
          'Äre Kont an Äre Plang: soulaang Äre Kont existéiert.',
          'Umeldungslinken: een Dag nodeems se ofgelaf sinn, geläscht. Sessiounen hale 60 Deeg oder bis Dir Iech ofmellt.',
          'Server-Protokoller: ongeféier 14 Deeg.',
          'Fotoe vu Bongen: bis een Elterendeel d’Foto oder hir Ausgab ewechhëlt, oder de Plang geläscht gëtt. Eng Foto, déi zu kenger Ausgab méi gehéiert, gëtt bannent 7 Deeg vum Server geläscht.',
          'Sécherungen: All Nuecht gëtt eng Kopie vun der Datebank gemaach an 14 Deeg um selwechte Server gehalen. Geläscht Daten verschwannen also bannent 14 Deeg aus de Sécherungen. Missten mir eng Kéier eng Sécherung zréckspillen, läsche mir d’Konten, déi zënterhier geläscht goufen, nach eng Kéier.',
        ],
      },
      {
        h: 'Äre Kont läschen',
        p: ['Maacht an der App „Dateschutz a Kont“ op, gitt Är E-Mail-Adress an a confirméiert. Dat geschitt direkt:'],
        list: [
          'Äre Kont, Är E-Mail-Adress an Är Sessioune ginn geläscht.',
          'Wann deen aneren Elterendeel nach am Plang ass, bleift de Plang bei him, well et och seng Ënnerlag ass. Hie behält, wat Dir allebéid agedroen hutt, och Är Messagen an Ären Numm, sou wéi e am Plang steet. Den Invitatiounscode ännert sech. Wann eppes, wat Dir geschriwwen hutt, ewechgeholl soll ginn, frot deen aneren Elterendeel oder schreift eis.',
          'Wann Dir deen eenzegen Elterendeel am Plang sidd, ginn de Plang an säi ganzen Inhalt geläscht.',
          'D’Kopie an Ärem Browser gëtt op deem Apparat direkt ewechgeholl, an op Ären aneren Apparater beim nächsten Opmaache vun der App.',
        ],
      },
      {
        h: 'Är Rechter',
        p: [
          'Dir kënnt verlaangen, Är Daten ze gesinn, ze korrigéieren, erofzelueden oder ze läschen, hir Notzung anzeschränken oder hir ze widderspriechen, an Är Awëllegung fir Gesondheetsnotizen zréckzéien. Eng Kopie luet Dir selwer ënner „Dateschutz a Kont“ erof, dat meescht ännert Dir direkt an der App. Fir alles anescht, schreift un {email}. Mir äntweren bannent engem Mount.',
          'Dir kënnt Iech och bei der Lëtzebuerger Dateschutzautoritéit CNPD beschwéieren (cnpd.public.lu).',
        ],
      },
      {
        h: 'Cookien',
        p: ['Mir benotzen een eenzege Cookie, deen Iech ugemellt hält. Ouni hie funktionéiert de Service net, dofir froe mir net no enger Awëllegung. Et gëtt keng Reklamms- oder Analyse-Cookien.'],
      },
      {
        h: 'Sécherheet',
        p: ['De Site funktionéiert just iwwer eng verschlësselt Verbindung. Dir mellt Iech mat engem Link un, deen eng Kéier funktionéiert an no 15 Minutten ofleeft, also gëtt et kee Passwuert fir ze klauen. D’Datebank ass just vum Server selwer aus z’erreechen. Äre Plang ass och op Ärem Telefon, haalt en also gespaart.'],
      },
      {
        h: 'Ännerungen',
        p: ['Wa mir dës Erklärung änneren, aktualiséiere mir den Datum uewen. Iwwer wichteg Ännerunge informéiere mir Iech an der App.'],
      },
    ],
  },
}

// ALL learner-facing text lives here. Components must not hard-code UI strings.
//   nl — what she sees (A1 Dutch: short sentences, present tense, common words, no idioms)
//   fr — help text in French. Only HELP and RATINGS are ever shown (Hulp panel, rating overlay), in the student's
//        help language: HELP/RATINGS also have `en` (src/helpLang.ts). The other `fr` strings are documentation.
// `{name}` placeholders are filled by t()/tFr(). Review list: docs/UI-STRINGS.md (npm run ui-strings).
// Keep this file free of TS-only runtime syntax (no enums): scripts run it with plain Node.

export type Str = { nl: string; fr: string; en?: string };

export const UI = {
  // Home
  'home.due': { nl: 'te herhalen', fr: 'cartes à revoir' },
  'home.newToday': { nl: 'nieuw vandaag', fr: 'nouvelles cartes aujourd’hui' },
  'home.start': { nl: 'Starten', fr: 'Commencer' },
  'home.cards': { nl: '{n} kaarten', fr: '{n} cartes en tout' },
  'home.empty': { nl: 'Nog geen kaarten. Open het menu en tik op Bijwerken.', fr: 'Pas encore de cartes. Ouvre le menu et touche « Bijwerken ».' },
  'home.emptyOffline': { nl: 'Nog geen kaarten. Zet het internet aan.', fr: 'Pas encore de cartes. Connecte-toi à internet.' },
  'home.allDone': { nl: 'Klaar voor nu!', fr: 'Fini pour le moment !' },
  'home.later': { nl: 'Volgende kaarten: {list}', fr: 'Prochaines cartes aujourd’hui : {list}' },
  'home.laterMin': { nl: '{n} over ± {m} min', fr: '{n} dans environ {m} minutes' },
  'home.laterHour': { nl: '{n} over ± {h} uur', fr: '{n} dans environ {h} heure(s)' },
  'today.label': { nl: 'Vandaag', fr: 'Aujourd’hui' },
  'today.left': { nl: 'Nog {n} kaarten', fr: 'Encore {n} cartes aujourd’hui' },
  'today.left1': { nl: 'Nog 1 kaart', fr: 'Encore 1 carte aujourd’hui' },

  'db.blocked': {
    nl: 'SpeesRep is nog open in een ander venster. Sluit het en open de app opnieuw.',
    fr: 'Une autre fenêtre de SpeesRep (ancienne version) est encore ouverte : ferme-la, puis rouvre l’appli.'
  },

  // Status + sync
  'status.offline': { nl: 'Geen internet', fr: 'Pas d’internet' },
  'sync.button': { nl: 'Bijwerken', fr: 'Mettre à jour (télécharger la nouvelle liste de mots ; rien n’est envoyé)' },
  'sync.running': { nl: 'Bijwerken…', fr: 'Mise à jour en cours…' },
  'sync.error': { nl: 'Geen verbinding. Probeer het opnieuw.', fr: 'La mise à jour n’a pas marché. Réessaie plus tard.' },
  'sync.last': { nl: 'Bijgewerkt: {ago}', fr: 'Liste de mots mise à jour : {ago}' },
  'sync.never': { nl: 'Nog geen woorden', fr: 'Pas encore de liste de mots' },

  // Review
  'review.back': { nl: 'Terug', fr: 'Retour' },
  'review.show': { nl: 'Antwoord tonen', fr: 'Montrer la réponse' },

  // Topics (tag filter)
  'tags.title': { nl: 'Kies een onderwerp', fr: 'Choisis un ou plusieurs thèmes' },
  'tags.all': { nl: 'Alle onderwerpen', fr: 'Tous les thèmes' },
  'tags.done': { nl: 'Klaar', fr: 'Terminé' },
  'tags.locked': { nl: 'nog dicht', fr: 'pas encore ouvert : il s’ouvre quand le thème précédent est bien su' },
  'home.topicAll': { nl: 'Onderwerp: alle', fr: 'Thème : tous' },
  'home.topic': { nl: 'Onderwerp: {list}', fr: 'Thème : {list}' },

  // Menu (tap "SpeesRep")
  'menu.open': { nl: 'Menu openen', fr: 'Ouvrir le menu (progression, cartes marquées, réglages, à propos, mise à jour)' },
  'menu.title': { nl: 'Menu', fr: 'Menu' },

  // Voortgang (progress overview)
  'progress.title': { nl: 'Voortgang', fr: 'Ma progression' },

  // Over SpeesRep
  'about.title': { nl: 'Over SpeesRep', fr: 'À propos de SpeesRep' },
  'about.intro': {
    nl: 'SpeesRep helpt je om Nederlandse woorden te leren. Je oefent elke dag een beetje.',
    fr: 'SpeesRep t’aide à apprendre des mots néerlandais. Tu t’exerces un peu chaque jour.'
  },
  'about.privacy': {
    nl: 'Je voortgang blijft op dit toestel. SpeesRep stuurt niets naar een server. Het haalt alleen de woordenlijst op. Geen account, geen naam, geen e-mailadres.',
    fr: 'Ta progression reste sur cet appareil. SpeesRep n’envoie rien à un serveur : il télécharge seulement la liste de mots. Pas de compte, pas de nom, pas d’e-mail.'
  },
  'about.imagesTitle': { nl: 'Plaatjes', fr: 'Images' },
  'about.images': {
    nl: 'Alle plaatjes zijn gemaakt door OpenMoji (https://openmoji.org/), het open-source emoji- en iconenproject. De plaatjes zijn niet aangepast.',
    fr: 'Toutes les images viennent d’OpenMoji (https://openmoji.org/), un projet libre d’emojis et d’icônes. Elles ne sont pas modifiées.'
  },
  'about.license': {
    nl: 'Licentie: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)',
    fr: 'Licence : CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)'
  },
  'about.imagesEn': {
    nl: 'All emojis designed by OpenMoji – the open-source emoji and icon project. License: CC BY-SA 4.0',
    fr: 'All emojis designed by OpenMoji – the open-source emoji and icon project. License: CC BY-SA 4.0'
  },

  // Instellingen (phone only)
  'settings.title': { nl: 'Instellingen', fr: 'Réglages' },
  'settings.newPerDay': { nl: 'Max. aantal nieuwe woorden per dag', fr: 'Nombre maximum de nouveaux mots par jour' },
  'settings.default': { nl: 'Standaard ({n})', fr: 'Par défaut ({n})' },
  'settings.listening': { nl: 'Luisteroefeningen', fr: 'Exercices d’écoute' },
  'settings.readAnswer': { nl: 'Antwoord voorlezen', fr: 'Lire la réponse à voix haute' },
  'settings.on': { nl: 'Aan', fr: 'Activé' },
  'settings.off': { nl: 'Uit', fr: 'Désactivé' },
  'settings.noVoice': { nl: 'Geen Nederlandse stem op dit toestel.', fr: 'Pas de voix néerlandaise sur cet appareil.' },
  'backup.title': { nl: 'Back-up', fr: 'Sauvegarde' },
  'backup.save': { nl: 'Back-up opslaan', fr: 'Enregistrer une sauvegarde (fichier)' },
  'backup.load': { nl: 'Back-up terugzetten', fr: 'Restaurer une sauvegarde (fichier)' },
  'backup.done': { nl: 'Back-up teruggezet: {n} kaarten.', fr: 'Sauvegarde restaurée : progression de {n} cartes reprise.' },
  'backup.skipped': { nl: '{n} delen van de back-up zijn niet goed. Die blijven weg.', fr: '{n} éléments de la sauvegarde sont abîmés : ils sont ignorés.' },
  'backup.confirmTitle': { nl: 'Back-up terugzetten?', fr: 'Restaurer la sauvegarde ?' },
  'backup.confirm': {
    nl: 'De back-up vervangt je voortgang van {n} kaarten op dit toestel. Nieuwere voortgang blijft.',
    fr: 'La sauvegarde remplace ta progression pour {n} cartes sur cet appareil. Une progression plus récente est gardée.'
  },
  'backup.replace': { nl: 'Vervangen', fr: 'Remplacer' },
  'backup.cancel': { nl: 'Annuleren', fr: 'Annuler' },
  'backup.note': {
    nl: 'Je voortgang staat alleen op dit toestel. Bewaar soms een back-up.',
    fr: 'Ta progression est seulement sur cet appareil. Enregistre parfois une sauvegarde (fichier).'
  },
  'backup.notPersisted': {
    nl: 'Let op: de browser kan je voortgang wissen. Bewaar vaak een back-up.',
    fr: 'Attention : le navigateur peut effacer ta progression. Enregistre souvent une sauvegarde.'
  },
  'backup.bad': { nl: 'Dit is geen SpeesRep-back-up.', fr: 'Ce fichier n’est pas une sauvegarde SpeesRep.' },
  'backup.otherApp': { nl: 'Deze back-up is van een andere versie van de app.', fr: 'Cette sauvegarde vient d’une autre version de l’appli (DEV/PROD).' },
  'progress.learned': { nl: 'kaarten geoefend (van {n})', fr: 'cartes déjà travaillées (sur {n} en tout)' },
  'progress.known': { nl: 'kaarten bekend', fr: 'cartes bien sues (elles reviennent dans 3 semaines ou plus)' },
  'progress.week': { nl: 'herhalingen deze week', fr: 'révisions ces 7 derniers jours' },
  'progress.streak': { nl: 'dagen op rij', fr: 'jours de suite avec au moins une révision' },
  'progress.dueToday': { nl: 'vandaag', fr: 'cartes à revoir aujourd’hui' },
  'progress.dueTomorrow': { nl: 'morgen', fr: 'cartes à revoir demain' },
  'progress.due7': { nl: 'deze week', fr: 'cartes à revoir dans les 7 prochains jours' },

  // Audio
  'audio.listen': { nl: 'Luister', fr: 'Écouter' },
  'audio.play': { nl: 'Luisteren', fr: 'Écouter le mot en néerlandais' },
  'audio.question': { nl: 'Wat hoor je?', fr: 'Qu’est-ce que tu entends ? Essaie de comprendre le mot, puis montre la réponse.' },
  'audio.noVoice': {
    nl: 'Geen Nederlandse stem op deze telefoon.',
    fr:
      'Pas de voix néerlandaise sur ce téléphone. iPhone : Réglages › Accessibilité › Contenu énoncé › Voix › ' +
      'Néerlandais (télécharger). Android : Paramètres › Synthèse vocale (Google) › Installer les données vocales › Néerlandais.'
  },

  // 🚩 Student flags ("Gemarkeerd", local only). NOT the sheet's Cards.flags (see 'flag.*' below).
  'mark.button': { nl: 'Kaart markeren', fr: 'Marquer cette carte (pour en parler plus tard)' },
  'mark.done': { nl: 'Gemarkeerd', fr: 'Carte marquée' },
  'mark.addNote': { nl: '+ notitie', fr: '+ ajouter une note' },
  'mark.notePlaceholder': { nl: 'Notitie (mag leeg)', fr: 'Note (facultative), par ex. « pourquoi pas het ? »' },
  'mark.save': { nl: 'Opslaan', fr: 'Enregistrer' },
  'mark.title': { nl: 'Gemarkeerd', fr: 'Cartes marquées' },
  'mark.badge': { nl: '🚩 {n}', fr: '🚩 {n} cartes marquées' },
  'mark.empty': { nl: 'Nog niets gemarkeerd.', fr: 'Aucune carte marquée pour l’instant.' },
  'mark.resolve': { nl: 'Opgelost', fr: 'Résolu' },
  'mark.resolvedSection': { nl: 'Opgelost ({n})', fr: 'Résolus ({n})' },
  'mark.share': { nl: 'Delen', fr: 'Partager (Messages, e-mail…)' },
  'mark.copy': { nl: 'Kopieer naar klembord', fr: 'Copier dans le presse-papiers' },
  'mark.copied': { nl: 'Gekopieerd', fr: 'Copié' },
  'mark.shareTitle': { nl: 'SpeesRep: gemarkeerde kaarten', fr: 'SpeesRep : cartes marquées' },

  // Card flags (key = value in the Cards.flags column)
  'flag.abbreviation': { nl: 'afkorting', fr: 'abréviation : forme courte d’un mot (min = minuten)' },
  'flag.false-friend': { nl: 'valse vriend', fr: 'faux ami : ressemble à un mot français, mais le sens est différent' },

  // Relative time
  'time.justNow': { nl: 'zojuist', fr: 'à l’instant' },
  'time.minuteAgo': { nl: '1 minuut geleden', fr: 'il y a 1 minute' },
  'time.minutesAgo': { nl: '{n} minuten geleden', fr: 'il y a {n} minutes' },
  'time.hourAgo': { nl: '1 uur geleden', fr: 'il y a 1 heure' },
  'time.hoursAgo': { nl: '{n} uur geleden', fr: 'il y a {n} heures' },
  'time.dayAgo': { nl: '1 dag geleden', fr: 'il y a 1 jour' },
  'time.daysAgo': { nl: '{n} dagen geleden', fr: 'il y a {n} jours' },
  'time.weekAgo': { nl: '1 week geleden', fr: 'il y a 1 semaine' },
  'time.weeksAgo': { nl: '{n} weken geleden', fr: 'il y a {n} semaines' },

  // Install hint (Safari, not yet on the Home Screen). {share}/{add} are the iOS icons.
  'install.hint': {
    nl: 'Zet de app op je scherm: tik op {share} en dan op {add}.',
    fr: 'Ajoute l’appli à ton écran d’accueil : touche {share} (Partager), puis {add} (Sur l’écran d’accueil).'
  },
  'install.close': { nl: 'Sluiten', fr: 'Fermer' },
  'install.android': { nl: 'App installeren', fr: 'Installer l’appli sur ton téléphone (écran d’accueil)' },

  // Update banner
  'update.available': { nl: 'Er is een nieuwe versie.', fr: 'Une nouvelle version est disponible.' },
  'update.open': { nl: 'Openen', fr: 'Ouvrir la nouvelle version' },

  // Help
  'help.button': { nl: 'Hulp', fr: 'Aide' },
  'help.title': { nl: 'Hulp', fr: 'Aide' },
  'help.close': { nl: 'Sluiten', fr: 'Fermer' },
  'help.updated': { nl: 'nieuw', fr: 'l’aide de cet écran a changé : touche « Hulp » pour la relire' },

  // Rating buttons (labels + meanings live in RATINGS below)
  'rating.aria': { nl: '{label}, {interval}', fr: '{label}, {interval}' },
  'rating.helpTitle': { nl: 'De vier knoppen', fr: 'Les quatre boutons' },
  'rating.helpOk': { nl: 'Klaar', fr: 'Compris' },
  'rating.helpReopen': { nl: 'Uitleg van de knoppen', fr: 'Explication des boutons' },

  // Group (code) and help language
  'join.title': { nl: 'Je groep', fr: 'Ton groupe' },
  'join.text': { nl: 'Typ de code van je groep. Je krijgt de code van je leraar.', fr: 'Tape le code de ton groupe. Ton professeur te donne le code.' },
  'join.label': { nl: 'Code van je groep', fr: 'Code de ton groupe' },
  'join.button': { nl: 'Verder', fr: 'Continuer' },
  'join.busy': { nl: 'Even zoeken…', fr: 'Recherche…' },
  'join.bad': { nl: 'Een code heeft 8 letters en cijfers.', fr: 'Un code a 8 lettres et chiffres.' },
  'join.unknown': { nl: 'Deze code bestaat niet.', fr: 'Ce code n’existe pas.' },
  'join.stopped': { nl: 'Deze groep is gestopt.', fr: 'Ce groupe est arrêté.' },
  'join.offline': { nl: 'Geen internet. Probeer het opnieuw.', fr: 'Pas d’internet. Réessaie.' },
  'join.cancel': { nl: 'Terug', fr: 'Retour' },
  'lang.title': { nl: 'Je hulptaal', fr: 'Ta langue d’aide' },
  'lang.text': { nl: 'In welke taal wil je hulp?', fr: 'Dans quelle langue veux-tu de l’aide ?' },
  'lang.none': { nl: 'Geen hulptaal', fr: 'Pas de langue d’aide' },
  'group.menu': { nl: 'Groep: {name}', fr: 'Groupe : {name}' },
  'group.stopped': { nl: 'Je groep is gestopt. Je kunt blijven oefenen.', fr: 'Ton groupe est arrêté. Tu peux continuer à t’exercer.' },
  'group.unknown': { nl: 'Je groep bestaat niet meer. Je kunt blijven oefenen.', fr: 'Ton groupe n’existe plus. Tu peux continuer à t’exercer.' },
  'settings.helpLang': { nl: 'Hulptaal', fr: 'Langue d’aide' },
} as const satisfies Record<string, Str>;

export type UIKey = keyof typeof UI;

/** Instructions per screen in each help language, shown only in the Hulp panel (src/helpLang.ts › helpText). */
export const HELP = {
  home: {
    nl: 'Hier zie je je kaarten voor vandaag. Tik op Starten.',
    fr:
      'Touche « SpeesRep » en haut pour le menu : « Voortgang » (ta progression) et « Gemarkeerd » (cartes marquées 🚩). ' +
      'Cet écran montre combien de cartes tu dois revoir aujourd’hui (« te herhalen ») et combien de nouvelles ' +
      'cartes t’attendent (« nieuw vandaag »). La barre « Vandaag » montre ton travail du jour ; « Nog 5 kaarten » = ' +
      'encore 5 cartes. Touche « Starten » pour commencer ; tu peux t’arrêter quand tu veux (« Terug »), tout est ' +
      'gardé. « Klaar voor nu! » = fini pour le moment ; « Volgende kaarten: 3 over ± 15 min » = 3 cartes ' +
      'reviennent dans environ 15 minutes ; elles arrivent alors dans « Vandaag » et « Starten » revient. L’appli fonctionne aussi sans internet : tes réponses restent sur le téléphone ' +
      'et ne sont jamais envoyées. Dans le menu (touche « SpeesRep » en haut) : « Bijwerken » télécharge ' +
      'la nouvelle liste de mots quand tu as internet (ça se fait aussi tout seul). ' +
      'Chaque écran a sa propre page « Hulp » : touche « Hulp » là où tu es.',
    en: 'Tap “SpeesRep” at the top for the menu: “Voortgang” (your progress) and “Gemarkeerd” (cards you marked 🚩). This screen shows how many cards you need to review today (“te herhalen”) and how many new cards are waiting (“nieuw vandaag”). The “Vandaag” bar shows today’s work; “Nog 5 kaarten” = 5 cards left. Tap “Starten” to begin; you can stop whenever you like (“Terug”), everything is kept. “Klaar voor nu!” = done for now; “Volgende kaarten: 3 over ± 15 min” = 3 cards come back in about 15 minutes; they then appear in “Vandaag” and “Starten” comes back. The app also works without internet: your answers stay on the phone and are never sent. In the menu (tap “SpeesRep” at the top): “Bijwerken” downloads the new word list when you have internet (this also happens by itself). Every screen has its own “Hulp” page: tap “Hulp” wherever you are.'
  },
  about: {
    nl: 'Hier lees je over SpeesRep.',
    fr:
      'Cette page explique SpeesRep : à quoi sert l’appli, que ta progression reste sur ton téléphone (pas de compte, ' +
      'pas de nom, pas d’e-mail) et d’où viennent les images (OpenMoji, licence CC BY-SA 4.0).',
    en: 'This page explains SpeesRep: what the app is for, that your progress stays on your phone (no account, no name, no email) and where the pictures come from (OpenMoji, licence CC BY-SA 4.0).'
  },
  settings: {
    nl: 'Hier kies je je instellingen.',
    fr:
      'Ces réglages restent sur ton téléphone. « Max. aantal nieuwe woorden per dag » = combien de nouveaux mots ' +
      'au maximum chaque jour (« Standaard » = le choix de ton professeur). « Luisteroefeningen » = parfois la carte ' +
      'commence seulement par le son ; « Uit » = jamais. « Antwoord voorlezen » = le téléphone lit la réponse ' +
      'néerlandaise à voix haute quand tu la montres. « Hulptaal » = la langue de l’aide (ou aucune). « Back-up opslaan » enregistre ta progression dans un ' +
      'fichier ; « Back-up terugzetten » la remet depuis ce fichier (par exemple sur un nouveau téléphone). ' +
      'Les changements comptent tout de suite, pour la prochaine carte.',
    en: 'These settings stay on your phone. “Max. aantal nieuwe woorden per dag” = the most new words per day (“Standaard” = your teacher’s choice). “Luisteroefeningen” = sometimes a card starts with the sound only; “Uit” = never. “Antwoord voorlezen” = the phone reads the Dutch answer aloud when you show it. “Hulptaal” = the language of the help (or none). “Back-up opslaan” saves your progress in a file; “Back-up terugzetten” puts it back from that file (for example on a new phone). Changes count straight away, from the next card.'
  },
  progress: {
    nl: 'Hier zie je je voortgang.',
    fr:
      'Ta progression : « kaarten geoefend » = cartes déjà travaillées, « kaarten bekend » = cartes bien sues, ' +
      '« herhalingen deze week » = révisions des 7 derniers jours, « dagen op rij » = jours de suite. ' +
      'En bas : combien de cartes reviennent aujourd’hui (vandaag), demain (morgen) ' +
      'et cette semaine (deze week).',
    en: 'Your progress: “kaarten geoefend” = cards you have practised, “kaarten bekend” = cards you know well, “herhalingen deze week” = reviews in the last 7 days, “dagen op rij” = days in a row. At the bottom: how many cards come back today (vandaag), tomorrow (morgen) and this week (deze week).'
  },
  marked: {
    nl: 'Hier zie je je gemarkeerde kaarten.',
    fr:
      'Ici, les cartes que tu as marquées avec 🚩 pendant les révisions, les plus récentes en haut. ' +
      '« Opgelost » = résolu : la carte passe dans la liste « Opgelost » (rien n’est effacé). « Delen » = ' +
      'partager la liste (Messages, e-mail…) avec ton prof ou quelqu’un d’autre : c’est toi qui l’envoies, ' +
      'rien ne part tout seul.',
    en: 'Here are the cards you marked with 🚩 during reviews, newest first. “Opgelost” = solved: the card moves to the “Opgelost” list (nothing is deleted). “Delen” = share the list (Messages, email…) with your teacher or someone else: you send it yourself, nothing goes anywhere by itself.'
  },
  topics: {
    nl: 'Kies een of meer onderwerpen. Tik dan op Klaar.',
    fr:
      'Choisis un ou plusieurs thèmes : « Starten » ne montre plus que les cartes de ces thèmes ' +
      '(révisions et nouvelles cartes). « Alle onderwerpen » = tous les thèmes. 🔒 « nog dicht » = pas encore ' +
      'ouvert : ce thème s’ouvrira plus tard (à une date, ou quand tu connais bien d’autres thèmes). Touche « Klaar » pour revenir.',
    en: 'Choose one or more topics: “Starten” then only shows cards from these topics (reviews and new cards). “Alle onderwerpen” = all topics. 🔒 “nog dicht” = not open yet: this topic opens later (on a date, or when you know other topics well). Tap “Klaar” to go back.'
  },
  review: {
    nl: 'Lees de kaart. Tik op Antwoord tonen. Kies dan een knop.',
    fr:
      'Lis la carte et essaie de te souvenir de la réponse. Touche « Antwoord tonen » pour la voir, puis dis ' +
      'honnêtement comment ça s’est passé : ❌ Opnieuw = je ne savais pas, 😅 Moeilijk = j’ai hésité, ' +
      '✅ Goed = bien, 😎 Makkelijk = très facile. Sous chaque bouton : quand la carte reviendra ' +
      '(min = minutes, u = heures, d = jours, wk = semaines, mnd = mois, jr = ans). Les noms montrent toujours ' +
      '« de » ou « het ». Badges : « valse vriend » = faux ami, « afkorting » = abréviation. ' +
      '« Terug » = retour à l’accueil : tu peux t’arrêter quand tu veux, tout est gardé. ' +
      '🔊 = écouter le mot en néerlandais. Parfois la carte commence seulement par le son (« Wat hoor je? ») : ' +
      'écoute, devine, puis « Antwoord tonen ». S’il n’y a pas de voix néerlandaise sur ton téléphone : ' +
      'iPhone : Réglages › Accessibilité › Contenu énoncé › Voix › Néerlandais ; Android : Paramètres › ' +
      'Synthèse vocale › Installer les données vocales › Néerlandais. ' +
      '🚩 en haut de la carte = marquer une carte qui te pose question (appui long ou « + notitie » pour ' +
      'ajouter une note).',
    en: 'Read the card and try to remember the answer. Tap “Antwoord tonen” to see it, then say honestly how it went: ❌ Opnieuw = I didn’t know, 😅 Moeilijk = I hesitated, ✅ Goed = good, 😎 Makkelijk = very easy. Under each button: when the card comes back (min = minutes, u = hours, d = days, wk = weeks, mnd = months, jr = years). Nouns always show “de” or “het”. Badges: “valse vriend” = false friend, “afkorting” = abbreviation. “Terug” = back to the start screen: you can stop whenever you like, everything is kept. 🔊 = listen to the word in Dutch. Sometimes the card starts with the sound only (“Wat hoor je?”): listen, guess, then “Antwoord tonen”. If your phone has no Dutch voice: iPhone: Settings › Accessibility › Spoken Content › Voices › Dutch; Android: Settings › Text-to-speech › Install voice data › Dutch. 🚩 at the top of the card = mark a card you have a question about (long press or “+ notitie” to add a note).'
  },
  join: {
    nl: 'Typ de code van je groep.',
    fr: 'Tape le code de ton groupe (8 lettres et chiffres). Ton professeur te donne le code, souvent avec un lien ou un QR-code : avec le lien, tu n’as rien à taper. Ta progression reste sur ton téléphone ; le code est la seule chose que l’appli garde sur ton groupe.',
    en: 'Type your group’s code (8 letters and numbers). Your teacher gives you the code, often with a link or a QR code: with the link you don’t need to type anything. Your progress stays on your phone; the code is the only thing the app keeps about your group.'
  },
  language: {
    nl: 'Kies je hulptaal.',
    fr: 'Choisis la langue de l’aide : les explications et les traductions des cartes apparaissent dans cette langue. « Geen hulptaal » = seulement le néerlandais. Tu peux changer plus tard dans le menu › Instellingen.',
    en: 'Choose the language of the help: explanations and card translations appear in this language. “Geen hulptaal” = Dutch only. You can change it later in the menu › Instellingen.'
  }
} as const satisfies Record<string, Str>;

export type HelpScreen = keyof typeof HELP;

/** Rating buttons, left to right. rating = ts-fsrs Rating (1..4). fr/en = meaning shown in the help overlay. */
export const RATINGS = [
  { key: 'again', rating: 1, emoji: '❌', nl: 'Opnieuw', fr: 'je ne savais pas', en: 'I didn’t know' },
  { key: 'hard', rating: 2, emoji: '😅', nl: 'Moeilijk', fr: 'j’ai hésité', en: 'I hesitated' },
  { key: 'good', rating: 3, emoji: '✅', nl: 'Goed', fr: 'bien', en: 'good' },
  { key: 'easy', rating: 4, emoji: '😎', nl: 'Makkelijk', fr: 'très facile', en: 'very easy' }
] as const;

export type RatingKey = (typeof RATINGS)[number]['key'];

/** Interval units on the rating buttons ("10 min", "2 u", "3 d", "3 wk", "4 mnd", "1 jr"). */
export const INTERVAL_UNITS = {
  minute: 'min',
  hour: 'u',
  day: 'd',
  week: 'wk',
  month: 'mnd',
  year: 'jr'
} as const;

function fill(s: string, vars?: Record<string, string | number>): string {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Dutch UI text. */
export function t(key: UIKey, vars?: Record<string, string | number>): string {
  return fill(UI[key].nl, vars);
}

/** French help text (only for the Hulp panel and the rating overlay). */
export function tFr(key: UIKey, vars?: Record<string, string | number>): string {
  return fill(UI[key].fr, vars);
}

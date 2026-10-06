// Sheet schema — keep in sync with docs/SHEET.md.

var CARD_COLS = ['id', 'type', 'nl', 'article', 'pos', 'fr', 'example_nl', 'example_fr',
  'tags', 'flags', 'answer', 'added', 'active']; // tags_source was removed on 2026-10-05

var SCHEMA = {
  // Cards only (last column): `controle` = the teacher's approval ('' = nog niet, goedgekeurd, afgekeurd);
  // with Settings.require_approval only goedgekeurd cards go to the app. (The 🚩 `nakijken` column is gone since
  // 2026-10-05: a card that needs another look goes to the Inbox.)
  Cards: CARD_COLS.concat(['controle']),
  Progress: ['card_id', 'track', 'state', 'due', 'stability', 'difficulty', 'reps', 'lapses', 'last_review'],
  Log: ['event_id', 'card_id', 'track', 'ts', 'rating', 'mode', 'duration_ms', 'snapshot'],
  Tags: ['tag', 'label_nl', 'label_fr', 'description', 'subject_nl'],
  Inbox: CARD_COLS.concat(['status']),
  Settings: ['key', 'value', 'description'],
  Curriculum: ['order', 'tag', 'regel', 'datum', 'percentage', 'van_tags'],
  Dashboard: ['metric', 'value']
};

// Sheet values → API codes: dubbel = word (both directions), enkel = oneway (nl → answer),
// zin = sentence (cloze), vraag = question (fr prompt → nl). Old values woord/calc are still read.
var CARD_TYPES = ['dubbel', 'enkel', 'zin', 'vraag'];
var TRACKS = ['recog', 'prod'];
var MODES = ['nl_fr', 'fr_nl', 'cloze', 'question', 'listen'];

// Settings rows that setup removes from the sheet (features that no longer exist).
var OBSOLETE_SETTINGS = ['cooldown_minutes', 'session_max_cards', 'session_max_minutes', 'session_extra_cards',
  'session_resume_minutes', 'min_reviews_to_count', 'new_per_session', 'max_cards_per_round', 'compliments_enabled',
  'mature_stability_days', 'curriculum_only'];

var SETTINGS_DEFAULTS = [
  ['new_per_day', 10, 'Nieuwe kaarten per dag (per kalenderdag)'],
  ['desired_retention', 0.9, 'Gewenste kans om het te onthouden (FSRS, 0.7–0.97)'],
  ['unlock_prod_stability_days', 3, 'Stabiliteit (dagen) van herkennen voordat de richting FR → NL start'],
  ['known_stability_days', 7, 'Een kaart is "bekend" vanaf deze stabiliteit in dagen (curriculum-regel bekend, Voortgang)'],
  ['known_min_reviews', 2, '… en na minstens zoveel herhalingen'],
  ['show_french_help', true, 'Knop "Hulp" en Franse uitleg tonen (uitvinken als ze klaar is)'],
  ['max_learning_backlog', 3, 'Een nieuwe kaart komt pas als minder dan dit aantal kaarten nog in de korte stappen zit'],
  ['require_approval', false, 'Alleen kaarten met controle = goedgekeurd gaan naar de app (aan = de leerling ziet geen ongecontroleerde kaarten)'],
  ['listen_share', 0.3, 'Deel van de herkenningskaarten als luisterkaart (0 = uit; alleen met een Nederlandse stem op de telefoon)'],
  ['due_window_minutes', 5, 'Kaarten die binnen minder dan zoveel minuten terugkomen, tellen al mee (en komen terug in dezelfde ronde)'],
  ['max_reviews_per_day', 100, 'Maximaal aantal herhalingen per dag (stil; de rest schuift door naar morgen)']
];

// tag | label_nl (shown to the learner) | label_fr (teacher) | description | subject_nl (label above the card)
var TAGS_SEED = [
  ['huishouden', 'huishouden', 'la maison', 'Voorwerpen en kamers in huis', 'Thuis'],
  ['school', 'school', 'l\'école', 'School, klas, schoolspullen', 'School'],
  ['wiskunde', 'wiskunde', 'les maths', 'Woorden voor wiskunde', 'Wiskunde'],
  ['familie', 'familie', 'la famille', 'Familieleden', 'Familie'],
  ['reizen', 'reizen', 'les voyages', 'Vervoer, station, vakantie', 'Reizen'],
  ['eten', 'eten', 'la nourriture', 'Maaltijden, voedsel, keuken', 'Eten'],
  ['werk', 'werk', 'le travail', 'Beroepen, kantoor', 'Werk'],
  ['gezondheid', 'gezondheid', 'la santé', 'Lichaam, dokter, ziek zijn', 'Gezondheid'],
  ['winkelen', 'winkelen', 'les courses', 'Winkels, geld, kopen', 'Winkelen'],
  ['tijd', 'tijd', 'le temps', 'Uren, dagen, kalender', 'Tijd'],
  ['app', 'app', 'l\'appli', 'De woorden van de SpeesRep-app', 'App'],
  ['klok-1', 'klok niveau 1', 'horloge niveau 1', 'Hele en halve uren, minuten optellen', 'De tijd'],
  ['klok-2', 'klok niveau 2', 'horloge niveau 2', 'Kwartier, voor en over, tijden optellen', 'De tijd'],
  ['klok-3', 'klok niveau 3', 'horloge niveau 3', 'Elke minuut lezen, over middernacht rekenen', 'De tijd']
];

// order | tag | regel | datum | percentage | van_tags (a new, empty sheet only)
var CURRICULUM_SEED = [
  [1, 'app', 'altijd', '', '', ''],
  [2, 'klok-1', 'altijd', '', '', ''],
  [3, 'klok-2', 'bekend', '', 80, 'klok-1'],
  [4, 'klok-3', 'bekend', '', 80, 'klok-2']
];

// type|nl|article|pos|fr|example_nl|example_fr|tags|(unused, was tags_source)|flags
// (brief format, English codes; converted to Dutch sheet values by toSheetRow_ in Setup.gs)
var SEED_CARDS = [
  'word|huis|het|noun|la maison|Het huis is groot.|La maison est grande.|household|manual|',
  'word|tafel|de|noun|la table|De tafel staat in de keuken.|La table est dans la cuisine.|household|manual|',
  'word|stoel|de|noun|la chaise|Ik zit op de stoel.|Je suis assis sur la chaise.|household|manual|',
  'word|raam|het|noun|la fenêtre|Het raam is open.|La fenêtre est ouverte.|household|manual|',
  'word|gang|de|noun|le couloir|In de gang staan schoenen.|Il y a des chaussures dans le couloir.|household|manual|false-friend',
  'word|school|de|noun|l\'école|De school begint om acht uur.|L\'école commence à huit heures.|school|manual|',
  'word|leraar|de|noun|le professeur|De leraar legt de les uit.|Le professeur explique la leçon.|school|manual|',
  'word|boek|het|noun|le livre|Ik lees een boek.|Je lis un livre.|school|manual|',
  'word|getal|het|noun|le nombre|Dit getal is te groot.|Ce nombre est trop grand.|school, wiskunde|manual|',
  'word|optellen||verb (separable)|additionner|Ik tel de getallen op.|J\'additionne les nombres.|school, wiskunde|manual|separable',
  'word|moeder|de|noun|la mère|Mijn moeder werkt in een ziekenhuis.|Ma mère travaille dans un hôpital.|family|manual|',
  'word|broer|de|noun|le frère|Mijn broer woont in Brussel.|Mon frère habite à Bruxelles.|family|manual|',
  'word|trein|de|noun|le train|De trein vertrekt om negen uur.|Le train part à neuf heures.|travel|manual|',
  'word|station|het|noun|la gare|Het station is dichtbij.|La gare est proche.|travel|manual|false-friend',
  'word|reis|de|noun|le voyage|De reis duurt drie uur.|Le voyage dure trois heures.|travel|manual|',
  'word|eten||verb|manger|Wat eten we vandaag?|Qu\'est-ce qu\'on mange aujourd\'hui ?|||',
  'word|gaan||verb|aller|Ik ga naar huis.|Je rentre à la maison.|||',
  'word|groot||adj|grand|Mijn broer is heel groot.|Mon frère est très grand.|||',
  'word|alsjeblieft||phrase|s\'il te plaît / voilà|Alsjeblieft, hier is je koffie.|Voilà, voici ton café.|||',
  'word|opstaan||verb (separable)|se lever|Ik sta om zeven uur op.|Je me lève à sept heures.|||separable',
  'sentence|Ik {woon} in een klein huis.||sentence|J\'habite dans une petite maison.|||household|manual|',
  'sentence|Mijn zus {heet} Anna.||sentence|Ma sœur s\'appelle Anna.|||family|manual|',
  'question|Hoe laat vertrekt de trein?||question|Demande à quelle heure part le train.|||travel|manual|',
  'question|Hoe heet je?||question|Demande son prénom à quelqu\'un (tutoiement).|||||'
];

// Interface vocabulary: seeded into Cards in BOTH DEV and PROD (added 2026-09-27, before everything else).
// scripts/check-ui-vocab.mjs reads this list. Format as SEED_CARDS.
var APP_SEED_ADDED = '2026-09-27';
var APP_SEED_CARDS = [
  'word|app|de|noun|l\'appli|Ik open de app.|J\'ouvre l\'appli.|app|manual|',
  'word|scherm|het|noun|l\'écran|Het scherm is groot.|L\'écran est grand.|app|manual|',
  'word|woord|het|noun|le mot|Dit woord ken ik niet.|Je ne connais pas ce mot.|app|manual|',
  'word|kaart|de|noun|la carte (de révision)|Ik zie een kaart.|Je vois une carte.|app|manual|',
  'word|zin|de|noun|la phrase|Lees de zin.|Lis la phrase.|app|manual|',
  'word|vraag|de|noun|la question|Ik heb een vraag.|J\'ai une question.|app|manual|',
  'word|antwoord|het|noun|la réponse|Mijn antwoord is goed.|Ma réponse est bonne.|app|manual|',
  'word|onderwerp|het|noun|le sujet, le thème|Kies een onderwerp.|Choisis un thème.|app|manual|',
  'word|instellingen|de|noun (plural)|les réglages|Ik open de instellingen.|J\'ouvre les réglages.|app|manual|',
  'word|hulp|de|noun|l\'aide|Ik heb hulp nodig.|J\'ai besoin d\'aide.|app|manual|',
  'word|voortgang|de|noun|la progression|Mijn voortgang is goed.|Ma progression est bonne.|app|manual|',
  'word|verbinding|de|noun|la connexion|Er is geen verbinding.|Il n\'y a pas de connexion.|app|manual|',
  'word|internet|het|noun|internet|Ik heb internet nodig.|J\'ai besoin d\'internet.|app|manual|',
  'word|geluid|het|noun|le son|Het geluid is te zacht.|Le son est trop faible.|app|manual|',
  'word|versie|de|noun|la version|Er is een nieuwe versie.|Il y a une nouvelle version.|app|manual|',
  'word|dag|de|noun|le jour|Een dag heeft vierentwintig uur.|Un jour a vingt-quatre heures.|app|manual|',
  'word|week|de|noun|la semaine|Een week heeft zeven dagen.|Une semaine a sept jours.|app|manual|',
  'word|maand|de|noun|le mois|Een maand heeft dertig dagen.|Un mois a trente jours.|app|manual|',
  'word|jaar|het|noun|l\'an, l\'année|Een jaar heeft twaalf maanden.|Une année a douze mois.|app|manual|',
  'word|uur|het|noun|l\'heure (durée)|Het duurt een uur.|Ça dure une heure.|app|manual|',
  'word|minuut|de|noun|la minute|Wacht een minuut.|Attends une minute.|app, klok-3|manual|',
  'word|starten||verb|commencer, démarrer|Ik start de les.|Je commence la leçon.|app|manual|',
  'word|oefenen||verb|s\'exercer, pratiquer|Ik oefen elke dag.|Je m\'exerce tous les jours.|app|manual|',
  'word|herhalen||verb|répéter, réviser|We herhalen de woorden.|Nous révisons les mots.|app|manual|',
  'word|kiezen||verb|choisir|Ik kies een woord.|Je choisis un mot.|app|manual|',
  'word|luisteren||verb|écouter|Luister goed.|Écoute bien.|app|manual|',
  'word|typen||verb|taper|Typ het antwoord.|Tape la réponse.|app|manual|',
  'word|controleren||verb|vérifier|Ik controleer mijn antwoord.|Je vérifie ma réponse.|app|manual|',
  'word|tonen||verb|montrer, afficher|Ik toon het antwoord.|Je montre la réponse.|app|manual|',
  'word|openen||verb|ouvrir|Ik open het boek.|J\'ouvre le livre.|app|manual|',
  'word|sluiten||verb|fermer|Sluit de app.|Ferme l\'appli.|app|manual|',
  'word|synchroniseren||verb|synchroniser|Ik synchroniseer de app met wifi.|Je synchronise l\'appli avec le wifi.|app|manual|',
  'word|opslaan||verb (separable)|enregistrer, sauvegarder|Ik sla mijn voortgang op.|J\'enregistre ma progression.|app|manual|separable',
  'word|aanzetten||verb (separable)|allumer, activer|Ik zet het licht aan.|J\'allume la lumière.|app|manual|separable',
  'word|uitzetten||verb (separable)|éteindre, désactiver|Ik zet het geluid uit.|Je coupe le son.|app|manual|separable',
  'word|klaar||adj|fini, prêt|Ik ben klaar.|J\'ai fini. / Je suis prêt.|app|manual|',
  'word|nieuw||adj|nouveau|Dit is een nieuw woord.|C\'est un nouveau mot.|app|manual|',
  'word|goed||adj|bon, bien|Dat is goed.|C\'est bien.|app|manual|',
  'word|fout||adj|faux, incorrect|Dit antwoord is fout.|Cette réponse est fausse.|app|manual|',
  'word|juist||adj|correct, exact|Dat is juist.|C\'est exact.|app|manual|',
  'word|moeilijk||adj|difficile|Dit woord is moeilijk.|Ce mot est difficile.|app|manual|',
  'word|makkelijk||adj|facile|Deze zin is makkelijk.|Cette phrase est facile.|app|manual|',
  'word|volgende||adj|suivant, prochain|De volgende kaart.|La carte suivante.|app|manual|',
  'word|beschikbaar||adj|disponible|De app is beschikbaar.|L\'appli est disponible.|app|manual|',
  'word|opnieuw||adv|de nouveau|Probeer het opnieuw.|Réessaie.|app|manual|',
  'word|terug||adv|en arrière, retour|Ga terug.|Reviens en arrière.|app|manual|',
  'word|vandaag||adv|aujourd\'hui|Vandaag oefen ik tien woorden.|Aujourd\'hui je m\'exerce sur dix mots.|app|manual|',
  'word|geen||det|aucun, pas de|Ik heb geen tijd.|Je n\'ai pas le temps.|app|manual|',
  'word|nog eens||phrase|encore une fois|Zeg het nog eens.|Dis-le encore une fois.|app|manual|',
  'word|bedankt||phrase|merci|Bedankt voor je hulp.|Merci pour ton aide.|app|manual|',
  // Added 2026-09-28: words the interface uses (npm run ui-vocab)
  'word|doorgaan||verb (separable)|continuer|We gaan morgen door.|On continue demain.|app|manual|separable',
  'word|geleden||adv|il y a (temps)|Twee dagen geleden was ik ziek.|Il y a deux jours, j\'étais malade.|app|manual|',
  'word|graag||adv|volontiers, avec plaisir|Ik drink graag thee.|J\'aime boire du thé.|app|manual|',
  'word|knop|de|noun|le bouton|Tik op de knop.|Appuie sur le bouton.|app|manual|',
  'word|laatst||adv|la dernière fois, dernièrement|Wanneer heb je laatst geoefend?|Quand t\'es-tu exercée la dernière fois ?|app|manual|',
  'word|over||prep|dans (temps) ; sur, au sujet de|De les begint over tien minuten.|Le cours commence dans dix minutes.|app|manual|',
  'word|proberen||verb|essayer|Probeer het nog eens.|Essaie encore une fois.|app|manual|',
  'word|scheidbaar||adj|séparable|Opstaan is een scheidbaar werkwoord.|« Opstaan » est un verbe séparable.|app|manual|',
  'word|sessie|de|noun|la séance|De sessie duurt tien minuten.|La séance dure dix minutes.|app|manual|',
  'word|stoppen||verb|arrêter|Ik stop met de les.|J\'arrête la leçon.|app|manual|',
  'word|uitleg|de|noun|l\'explication|De uitleg is duidelijk.|L\'explication est claire.|app|manual|',
  'word|valse vriend|de|noun|le faux ami|Gang is een valse vriend.|« Gang » est un faux ami.|app|manual|',
  'word|vier||num|quatre|Ik heb vier boeken.|J\'ai quatre livres.|app|manual|',
  'word|voltooid||adj|terminé, achevé|De sessie is voltooid.|La séance est terminée.|app|manual|',
  'word|zojuist||adv|à l\'instant|Ik ben zojuist thuisgekomen.|Je viens de rentrer.|app|manual|',
  'word|dicht||adj|fermé|De deur is dicht.|La porte est fermée.|app|manual|',
  // Added 2026-10-02: words of the 🚩 "Gemarkeerd" screens
  'word|markeren||verb|marquer|Ik markeer een moeilijk woord.|Je marque un mot difficile.|app|manual|',
  'word|notitie|de|noun|la note|Ik schrijf een notitie.|J\'écris une note.|app|manual|',
  'word|delen||verb|partager|Ik deel de lijst met mijn leraar.|Je partage la liste avec mon professeur.|app|manual|',
  'word|kopiëren||verb|copier|Kopieer de tekst.|Copie le texte.|app|manual|',
  'word|klembord|het|noun|le presse-papiers|De tekst staat op het klembord.|Le texte est dans le presse-papiers.|app|manual|',
  'word|leeg||adj|vide|Het glas is leeg.|Le verre est vide.|app|manual|',
  'word|oplossen||verb (separable)|résoudre|Ik los het probleem op.|Je résous le problème.|app|manual|separable',
  'word|installeren||verb|installer|Ik installeer de app.|J\'installe l\'appli.|app|manual|',
  // Instellingen + back-up words (2026-10-04)
  'word|aantal|het|noun|le nombre|Het aantal kaarten is tien.|Le nombre de cartes est dix.|app|manual|',
  'word|maximaal||adj|maximum, au maximum (afkorting: max.)|Je krijgt maximaal tien nieuwe woorden.|Tu reçois au maximum dix nouveaux mots.|app|manual|',
  'word|standaard||adj|par défaut, standard|Standaard krijg je tien woorden.|Par défaut, tu reçois dix mots.|app|manual|',
  'word|luisteroefening|de|noun|l\'exercice d\'écoute|Ik doe een luisteroefening.|Je fais un exercice d\'écoute.|app|manual|',
  'word|toestel|het|noun|l\'appareil|Mijn toestel heeft geen stem.|Mon appareil n\'a pas de voix.|app|manual|',
  'word|back-up|de|noun|la sauvegarde|Ik maak een back-up.|Je fais une sauvegarde.|app|manual|',
  'word|terugzetten||verb (separable)|remettre, restaurer|Ik zet de back-up terug.|Je restaure la sauvegarde.|app|manual|separable',
  'word|voorlezen||verb (separable)|lire à voix haute|De telefoon leest het antwoord voor.|Le téléphone lit la réponse à voix haute.|app|manual|separable',
  'word|ander||adj|autre (andere = autre, avec -e)|Heb je een andere dag?|Tu as un autre jour ?|app|manual|',
  // Over SpeesRep words (2026-10-04)
  'word|aanpassen||verb (separable)|adapter, modifier|Ik pas de tekst aan.|J\'adapte le texte.|app|manual|separable',
  'word|account|het|noun|le compte|Ik heb geen account.|Je n\'ai pas de compte.|app|manual|',
  'word|een beetje||phrase|un peu|Ik spreek een beetje Nederlands.|Je parle un peu néerlandais.|app|manual|',
  'word|blijven||verb|rester|Ik blijf thuis.|Je reste à la maison.|app|manual|',
  'word|door||prep|par|Dit plaatje is gemaakt door een kind.|Cette image est faite par un enfant.|app|manual|',
  'word|e-mailadres|het|noun|l\'adresse e-mail|Wat is je e-mailadres?|Quelle est ton adresse e-mail ?|app|manual|',
  'word|elk||det|chaque (elke = chaque, avec -e)|Ik oefen elke dag.|Je m\'exerce chaque jour.|app|manual|',
  'word|emoji|de|noun|l\'emoji|Ik zie een emoji.|Je vois un emoji.|app|manual|',
  'word|maken||verb|faire, fabriquer|Ik maak een tekening.|Je fais un dessin.|app|manual|',
  'word|helpen||verb|aider|Kun je mij helpen?|Tu peux m\'aider ?|app|manual|',
  'word|icoon|het|noun|l\'icône|Tik op het icoon.|Touche l\'icône.|app|manual|',
  'word|project|het|noun|le projet|Dit is een groot project.|C\'est un grand projet.|app|manual|',
  'word|leren||verb|apprendre|Ik leer Nederlands.|J\'apprends le néerlandais.|app|manual|',
  'word|naam|de|noun|le nom|Wat is je naam?|Quel est ton nom ?|app|manual|',
  'word|nodig||adj|nécessaire (nodig hebben = avoir besoin de)|Ik heb een pen nodig.|J\'ai besoin d\'un stylo.|app|manual|',
  'word|plaatje|het|noun|l\'image (petite image)|Kijk naar het plaatje.|Regarde l\'image.|app|manual|',
  'word|open-source||adj|open source, libre|Deze app is open-source.|Cette appli est open source.|app|manual|',
  'word|vragen||verb|demander|Ik vraag de weg.|Je demande le chemin.|app|manual|'
];

// Abbreviations (enkel cards with the badge "afkorting" = flag `abbreviation`). Each sits in the category where it
// is first used, directly before the first card that uses it (same `added` date, the row just above it in the
// sheet). Without a "before" card they go first in `app` (added 2026-09-26): d/wk/mnd/jr appear on the rating
// buttons from the very first review; ev/mv are not used yet.
// Format: id|front|answer|tag|beforeId
var ABBREV_SEED_ADDED = '2026-09-26';
var ABBREV_SEED_CARDS = [
  'A-01|min|de minuut, de minuten — minute(s)|klok-1, tijd|K1-07',
  'A-02|u|het uur — heure (3:00u = drie uur)|klok-1, tijd|K1-05',
  'A-03|d|de dag, de dagen — jour(s)|app, tijd|',
  'A-04|wk|de week, de weken — semaine(s)|app, tijd|',
  'A-05|mnd|de maand, de maanden — mois|app, tijd|',
  'A-06|jr|het jaar — an(s), année(s)|app, tijd|',
  'A-07|ev|het enkelvoud — singulier|app|',
  'A-08|mv|het meervoud — pluriel|app|'
];

// Clock course (replaces the L1-/L2-/L3- set of 2026-09-29). Fixed ids, added 2026-09-30.
// Format: id|type|nl|article|pos|fr|example_nl|example_fr|tag|flags|answer   (type = API code)
// ANSWER RULE for durations (docs/SHEET.md): exactly 15/30/45/60/90 min → "15 min of een kwartier",
// "30 min of een half uur", "45 min of drie kwartier", "60 min of een uur", "90 min of anderhalf uur";
// other durations plain minutes ("20 min"); clock times (HH:MMu) never; skip when the prompt already
// names that unit (K2-08).
// DAGDEEL RULE for clock times: an answer "HH:MMu" with a TWO-digit hour (10–23, or 00 for midnight — never
// "0:MMu") gets " of <spoken> 's <dagdeel>"; one-digit hours (1–9) stay as they are. A reading card
// ("Het is 11:23u. …") follows the digit count of the time in the prompt and only gets " 's <dagdeel>".
// In sums the prompt time uses the same number of hour digits as the answer: "09:40u + 20 min" → "10:00u …".
// 06–11:59 's ochtends · 12–17:59 's middags · 18–23:59 's avonds · 00–05:59 's nachts.
var KLOK_SEED_ADDED = '2026-09-30';
var KLOK_SEED_CARDS = [
  'K1-01|word|klok|de|noun|l\'horloge|De klok hangt aan de muur.|L\'horloge est accrochée au mur.|klok-1, tijd||',
  'K1-02|word|uur|het|noun|l\'heure (l\'heure qu\'il est)|Het is twee uur.|Il est deux heures.|klok-1, tijd||',
  'K1-03|word|half||adj|demi (et demie)|Het is half drie.|Il est deux heures et demie.|klok-1, tijd|false-friend|',
  'K1-04|word|hoe laat is het?||phrase|quelle heure est-il ?|Hoe laat is het?|Quelle heure est-il ?|klok-1, tijd||',
  'K1-05|oneway|Het is 3:00u. Hoe laat is het?||klok||||klok-1, tijd||drie uur',
  'K1-06|oneway|Het is 4:30u. Hoe laat is het?||klok||||klok-1, tijd||half vijf',
  'K1-07|oneway|5 min + 5 min = ...||klok||||klok-1, tijd||10 min',
  'K1-08|oneway|10 min + 10 min = ...||klok||||klok-1, tijd||20 min',
  'K1-09|oneway|15 min + 15 min = ...||klok||||klok-1, tijd||30 min of een half uur',
  'K1-10|oneway|40 min + 20 min = ...||klok||||klok-1, tijd||60 min of een uur',
  'K2-01|word|kwart|het|noun|le quart|Het is kwart voor vijf.|Il est cinq heures moins le quart.|klok-2, tijd||',
  'K2-02|word|voor||prep|moins (avant l\'heure)|Het is tien voor acht.|Il est huit heures moins dix.|klok-2, tijd||',
  'K2-03|word|over||prep|après (l\'heure), et|Het is tien over acht.|Il est huit heures dix.|klok-2, tijd||',
  'K2-04|oneway|Het is 5:45u. Hoe laat is het?||klok||||klok-2, tijd||kwart voor zes',
  'K2-05|oneway|Het is 8:15u. Hoe laat is het?||klok||||klok-2, tijd||kwart over acht',
  'K2-06|oneway|09:40u + 20 min = ...||klok||||klok-2, tijd||10:00u of tien uur \'s ochtends',
  'K2-07|oneway|11:55u + 15 min = ...||klok||||klok-2, tijd||12:10u of tien over twaalf \'s middags',
  'K2-08|oneway|Een kwartier = ... min||klok||||klok-2, tijd||15 min',
  'K2-09|oneway|45 min = ... kwartier||klok||||klok-2, tijd||3 kwartier',
  'K2-10|oneway|90 min = ... uur||klok||||klok-2, tijd||anderhalf uur',
  'K2-11|oneway|5 min + 10 min = ...||klok||||klok-2, tijd||15 min of een kwartier',
  'K2-12|oneway|25 min + 20 min = ...||klok||||klok-2, tijd||45 min of drie kwartier',
  'K3-02|oneway|Het is 9:07u. Hoe laat is het?||klok||||klok-3, tijd||zeven over negen',
  'K3-03|oneway|Het is 6:52u. Hoe laat is het?||klok||||klok-3, tijd||acht voor zeven',
  'K3-04|oneway|Het is 11:23u. Hoe laat is het?||klok||||klok-3, tijd||zeven voor half twaalf \'s ochtends',
  'K3-05|oneway|14:37u + 38 min = ...||klok||||klok-3, tijd||15:15u of kwart over drie \'s middags',
  'K3-06|oneway|23:50u + 25 min = ...||klok||||klok-3, tijd||00:15u of kwart over twaalf \'s nachts',
  'K3-07|oneway|105 min = ... uur||klok||||klok-3, tijd||een uur en drie kwartier',
  'K3-08|oneway|50 min + 40 min = ...||klok||||klok-3, tijd||90 min of anderhalf uur'
];

// Emoji course (DEV only for now): enkel cards, front = emoji, back = the Dutch word (with de/het for nouns).
// Tag `emoji`, Curriculum order 3, added 2026-10-02. Seeded ONLY by `admin <env> seedEmoji` (not by setup).
// Format: id|emoji|answer
var EMOJI_SEED_ADDED = '2026-10-02';
var EMOJI_SEED_CARDS = [
  'E-01|🛏️|het bed',
  'E-02|🚪|de deur',
  'E-03|🛋️|de bank',
  'E-04|🧸|de knuffel',
  'E-05|🔑|de sleutel',
  'E-06|💡|de lamp',
  'E-07|🪞|de spiegel',
  'E-08|🍇|de druif',
  'E-09|🍊|de sinaasappel',
  'E-10|🍓|de aardbei',
  'E-11|🥕|de wortel',
  'E-12|🍅|de tomaat',
  'E-13|🥖|het stokbrood',
  'E-14|🍪|het koekje',
  'E-15|🍫|de chocolade',
  'E-16|🥛|de melk',
  'E-17|☕|de koffie',
  'E-18|🐮|de koe',
  'E-19|🐷|het varken',
  'E-20|🐴|het paard',
  'E-21|🐑|het schaap',
  'E-22|🐰|het konijn',
  'E-23|🦆|de eend',
  'E-24|🦋|de vlinder',
  'E-25|🐢|de schildpad',
  'E-26|🐝|de bij',
  'E-27|⭐|de ster',
  'E-28|☁️|de wolk',
  'E-29|🌧️|de regen',
  'E-30|❄️|de sneeuw',
  'E-31|🔥|het vuur',
  'E-32|💧|het water (de druppel)',
  'E-33|🏔️|de berg',
  'E-34|🌊|de golf',
  'E-35|🚌|de bus',
  'E-36|🚕|de taxi',
  'E-37|⛴️|de veerboot',
  'E-38|🏥|het ziekenhuis',
  'E-39|⛪|de kerk',
  'E-40|🌉|de brug',
  'E-41|👁️|het oog',
  'E-42|👂|het oor',
  'E-43|👃|de neus',
  'E-44|✋|de hand',
  'E-45|🦶|de voet',
  'E-46|🫀|het hart',
  'E-47|👕|het shirt',
  'E-48|👖|de broek',
  'E-49|🧥|de jas',
  'E-50|👟|de schoen',
  'E-51|🧦|de sok',
  'E-52|🧢|de pet',
  'E-53|✏️|het potlood',
  'E-54|✂️|de schaar',
  'E-55|📏|de liniaal',
  'E-56|🎒|de rugzak',
  'E-57|💻|de computer',
  'E-58|⛅|bewolkt'
];

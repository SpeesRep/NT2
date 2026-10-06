// "User info" tab: a start guide for the learner (Dutch A1 + French), one per environment.
// Filled by setup() when the tab is empty; `node scripts/admin.mjs <env> userInfo` rewrites it.

var USER_INFO_TAB = 'User info';

function userInfoRows_(env) {
  var prod = env === 'PROD';
  var link = prod ? 'https://speesrep.github.io/NT2/' : 'https://speesrep.github.io/NT2/dev/';
  var name = prod ? 'SpeesRep' : 'SpeesRep DEV';
  return [
    ['', 'Nederlands', 'Français'],
    ['Link', link, link + (prod ? '' : '   (version de TEST — la vraie version : https://speesrep.github.io/NT2/)')],
    ['1. Installeren',
      'Open de link in Safari. Tik op ⬆ (Deel). Kies "Zet op beginscherm". Tik op "Voeg toe".',
      'Ouvre le lien dans Safari. Touche ⬆ (Partager), puis « Sur l\'écran d\'accueil », puis « Ajouter ». ' +
      'Ensuite, ouvre toujours ' + name + ' avec l\'icône sur ton écran d\'accueil, pas dans Safari. ' +
      '(Chrome marche aussi sur iPhone avec iOS 16.4 ou plus récent.)'],
    ['2. De eerste keer',
      'Open de app met internet. Wacht tot je ziet: "Laatst gesynchroniseerd: zojuist".',
      'La première fois, ouvre l\'appli avec internet (wifi) et attends « Laatst gesynchroniseerd: zojuist » ' +
      '(= synchronisé à l\'instant). Tes cartes sont alors sur ton téléphone.'],
    ['3. Oefenen',
      'Tik op Starten. Lees de kaart. Tik op Antwoord tonen. Kies dan een knop.',
      'Touche « Starten » (commencer). Lis la carte, essaie de te souvenir, puis touche « Antwoord tonen » ' +
      '(montrer la réponse). Il n\'y a rien à écrire : tu dis toi-même si tu savais.'],
    ['4. De vier knoppen',
      '❌ Opnieuw · 😅 Moeilijk · ✅ Goed · 😎 Makkelijk',
      '❌ Opnieuw = je ne savais pas · 😅 Moeilijk = j\'ai hésité · ✅ Goed = bien · 😎 Makkelijk = très facile. ' +
      'Sous chaque bouton : quand la carte reviendra (min = minutes, u = heures, d = jours, wk = semaines, ' +
      'mnd = mois, jr = ans). Sois honnête : l\'appli s\'adapte à toi.'],
    ['5. Een sessie',
      'Na 15 kaarten of 8 minuten vraagt de app: "Wil je doorgaan?". Kies "Nog 10 kaarten, graag!" of "Stoppen".',
      'Une séance dure 15 cartes ou 8 minutes. Ensuite : « Nog 10 kaarten, graag! » = encore 10 cartes, ' +
      '« Stoppen » = arrêter. « ‹ Terug » = revenir à l\'accueil sans finir : « Doorgaan » te permet de ' +
      'continuer la même séance (pendant 30 minutes).'],
    ['6. Pauze',
      'Na een sessie is er een pauze. Je ziet: "Volgende sessie over 42 minuten".',
      'Après une séance, une pause d\'une heure : « Volgende sessie over 42 minuten » = prochaine séance dans ' +
      '42 minutes. Au début de la pause, un petit exercice en néerlandais à faire loin de l\'écran ' +
      '(« Zoek een rond voorwerp… ») : fais-le dans ta tête ou à voix haute, puis « OK ».'],
    ['7. Zonder internet',
      'De app werkt ook zonder internet. Je antwoorden gaan later vanzelf naar de server.',
      'L\'appli marche sans internet (« Geen internet »). Tes réponses restent sur le téléphone et partent ' +
      'toutes seules à la prochaine connexion. « 3 antwoorden nog niet gesynchroniseerd » = 3 réponses pas ' +
      'encore envoyées : c\'est normal. « Synchroniseren » = synchroniser maintenant.'],
    ['8. Onderwerpen',
      'Tik op "Onderwerp: alle". Kies een onderwerp. 🔒 = nog dicht.',
      '« Onderwerp: alle » → choisis un ou plusieurs thèmes (« Kies een onderwerp »). 🔒 « nog dicht » = ' +
      'pas encore ouvert : il s\'ouvre quand tu connais bien le thème d\'avant. « Alle onderwerpen » = tous.'],
    ['9. Hulp',
      'Tik op "Hulp" voor uitleg in het Frans.',
      'Le bouton « Hulp » (?) explique chaque écran en français. Le petit « ? » au-dessus des boutons ' +
      'rappelle leur sens.'],
    ['10. Nieuwe versie',
      'Zie je "Er is een nieuwe versie."? Tik op Openen.',
      'Si tu vois « Er is een nieuwe versie. » (nouvelle version), touche « Openen ». Ta progression est gardée.'],
    ['11. Belangrijk',
      'Wis de gegevens van Safari niet.',
      'N\'efface pas les données de Safari / des sites web : les réponses pas encore envoyées seraient perdues ' +
      '(ce qui est déjà synchronisé revient tout seul). Un problème ? Envoie une capture d\'écran à ton prof.']
  ];
}

/** Writes the guide (overwrites the tab). */
function writeUserInfo_(ss, env) {
  var sh = ss.getSheetByName(USER_INFO_TAB) || ss.insertSheet(USER_INFO_TAB, 0);
  sh.clear();
  var rows = userInfoRows_(env);
  sh.getRange(1, 1, rows.length, 3).setValues(rows).setWrap(true).setVerticalAlignment('top');
  sh.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e8eaed');
  sh.getRange(2, 1, rows.length - 1, 1).setFontWeight('bold');
  sh.getRange(2, 2, 1, 2).setFontWeight('bold').setFontSize(12);
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 150);
  sh.setColumnWidth(2, 380);
  sh.setColumnWidth(3, 520);
  return rows.length - 1;
}

/** setup(): fill once; never overwrite edits. */
function seedUserInfo_(ss, env) {
  var sh = ss.getSheetByName(USER_INFO_TAB);
  if (sh && sh.getLastRow() > 1) return;
  writeUserInfo_(ss, env);
}

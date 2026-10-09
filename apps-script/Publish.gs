// "Publiceren": asks GitHub to rebuild the site with every group's word list (.github/workflows/deploy.yml,
// repository_dispatch `publish`; it exports DEV and PROD). The student app only ever reads those files.
// Needs Script Property GITHUB_DISPATCH_TOKEN: a fine-grained GitHub token for SpeesRep/NT2 only, with
// Repository permission "Contents: Read and write" (required by repository_dispatch). Never in the repo.

var GITHUB_REPO = 'SpeesRep/NT2';

/** Owner page button (google.script.run). */
function reviewPublish() {
  requireTeacher_();
  return dispatchPublish_();
}

/** POSTs the repository_dispatch for this environment; returns {env, at}. Throws when GitHub refuses. */
function dispatchPublish_() {
  var env = String(env_()).toLowerCase();
  if (env !== 'dev' && env !== 'prod') throw new Error('ENV ontbreekt in de Script Properties.');
  var token = props_().getProperty('GITHUB_DISPATCH_TOKEN');
  if (!token) throw new Error('GITHUB_DISPATCH_TOKEN ontbreekt in de Script Properties.');
  var res = UrlFetchApp.fetch('https://api.github.com/repos/' + GITHUB_REPO + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: JSON.stringify({ event_type: 'publish', client_payload: { env: env } })
  });
  var code = res.getResponseCode();
  if (code !== 204) throw new Error('GitHub antwoordde ' + code + (code === 401 || code === 403 || code === 404 ? ' (token ongeldig of zonder rechten).' : '.'));
  var at = new Date().toISOString();
  props_().setProperty('LAST_PUBLISH', at);
  return { env: env, at: at };
}

/** Links for the Start page: the Actions run list and the published file. */
function publishInfo_() {
  return {
    last: props_().getProperty('LAST_PUBLISH') || '',
    runs: 'https://github.com/' + GITHUB_REPO + '/actions/workflows/deploy.yml',
    file: (APP_URLS[env_()] || '') + 'content.json'
  };
}

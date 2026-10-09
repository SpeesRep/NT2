import { render } from 'preact';
import { takeKeyFromLink } from './api';
import { App } from './App';
import './styles.css';

takeKeyFromLink();
// An invite link opened while the page is already open only changes the #: take the new key and start over.
window.addEventListener('hashchange', () => {
  if (/key=/.test(location.hash)) {
    takeKeyFromLink();
    location.reload();
  }
});
render(<App />, document.getElementById('docent')!);

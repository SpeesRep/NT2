import { render } from 'preact';
import { App } from './app';
import { initPWA } from './pwa';
import { persistStorage } from './storage';
import './installPrompt'; // registers beforeinstallprompt early (Android)
import './styles.css';

initPWA();
void persistStorage(); // first run: ask the browser to keep the progress (it exists only on this device)
render(<App />, document.getElementById('app')!);

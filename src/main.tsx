import { render } from 'preact';
import { App } from './app';
import { initPWA } from './pwa';
import './installPrompt'; // registers beforeinstallprompt early (Android)
import './styles.css';

initPWA();
render(<App />, document.getElementById('app')!);

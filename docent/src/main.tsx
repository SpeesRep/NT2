import { render } from 'preact';
import { takeKeyFromLink } from './api';
import { App } from './App';
import './styles.css';

takeKeyFromLink();
render(<App />, document.getElementById('docent')!);

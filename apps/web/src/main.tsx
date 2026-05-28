import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

/* StrictMode double-mount breaks some WebRTC attach lifecycles in dev; omit for reliable video. */
createRoot(document.getElementById('root')!).render(<App />);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@primer/react-brand/fonts/fonts.css';
import App from './App.jsx';
// After App, so these few layout rules come after the Primer Brand styles.
import './style.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

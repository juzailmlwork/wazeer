import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Chrome will not offer to install the app without a service worker that handles fetch.
// Registered after load so it never competes with the first render. See public/sw.js for why
// it caches so little.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // Not fatal: the app works, it just cannot be installed.
      console.warn('Service worker registration failed:', err.message);
    });
  });
}

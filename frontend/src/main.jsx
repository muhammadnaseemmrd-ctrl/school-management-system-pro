import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { Provider } from 'react-redux';
import store from './store/index.js';
import { LanguageProvider } from './i18n/LanguageContext.jsx';
import { ThemeProvider } from './theme/ThemeProvider.jsx';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/noto-naskh-arabic/arabic-400.css';
import '@fontsource/noto-naskh-arabic/arabic-600.css';
import '@fontsource/noto-naskh-arabic/arabic-700.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <LanguageProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </LanguageProvider>
    </Provider>
  </React.StrictMode>,
);

// Keep the app itself on the device so it still opens with no network (the service worker never caches /api)
if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });

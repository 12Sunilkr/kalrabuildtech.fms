import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import './styles/print.css';

// Suppress benign Chrome DevTools Live Metrics & extension background errors
if (typeof window !== 'undefined') {
  const isDevToolsError = (msg?: string, filename?: string) => {
    if (!msg) return false;
    return (
      msg.includes('startTime') ||
      msg.includes('reportAllChanges') ||
      (filename && filename.includes('VM')) ||
      (!filename && msg.includes('reading'))
    );
  };

  window.addEventListener('error', (event) => {
    if (isDevToolsError(event.message, event.filename)) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return true;
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reasonMsg = event.reason?.message || String(event.reason || '');
    if (isDevToolsError(reasonMsg)) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
    }
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
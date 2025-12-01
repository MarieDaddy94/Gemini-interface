import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { TradingSessionProvider } from './context/TradingSessionContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <TradingSessionProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </TradingSessionProvider>
  </React.StrictMode>
);
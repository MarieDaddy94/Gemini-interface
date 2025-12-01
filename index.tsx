
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { TradingSessionProvider } from './context/TradingSessionContext';
import { AutopilotJournalProvider } from './context/AutopilotJournalContext';
import { VisionProvider } from './context/VisionContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <TradingSessionProvider>
        <AutopilotJournalProvider>
          <VisionProvider>
            <App />
          </VisionProvider>
        </AutopilotJournalProvider>
      </TradingSessionProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

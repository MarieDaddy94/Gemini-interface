
import React, { ReactNode } from 'react';
import { AppWorldProvider } from './AppWorldContext';
import { AgentConfigProvider } from './AgentConfigContext';
import { TradingSessionProvider } from './TradingSessionContext';
import { JournalProvider } from './JournalContext';
import { AutopilotJournalProvider } from './AutopilotJournalContext';
import { VisionProvider } from './VisionContext';
import { VisionSettingsProvider } from './VisionSettingsContext';
import { TradeEventsProvider } from './TradeEventsContext';
import { VoiceActivityProvider } from './VoiceActivityContext';
import { RealtimeConfigProvider } from './RealtimeConfigContext';
import { ToolActivityProvider } from './ToolActivityContext';
import TradeEventsToJournal from '../components/TradeEventsToJournal';

interface Props {
  children: ReactNode;
}

/**
 * AppProviders consolidates all application contexts in the correct dependency order.
 * This prevents "Provider Hell" in App.tsx and ensures index.tsx is clean.
 */
export const AppProviders: React.FC<Props> = ({ children }) => {
  return (
    <AppWorldProvider>
      <AgentConfigProvider>
        <TradingSessionProvider>
          <JournalProvider>
            <AutopilotJournalProvider>
              <VisionProvider>
                <TradeEventsProvider>
                  <VisionSettingsProvider>
                    <VoiceActivityProvider>
                      <RealtimeConfigProvider>
                        <ToolActivityProvider>
                          {/* 
                             TradeEventsToJournal is a background component that listens 
                             to events and logs them. It needs to be inside the providers.
                          */}
                          <TradeEventsToJournal />
                          
                          {children}
                        </ToolActivityProvider>
                      </RealtimeConfigProvider>
                    </VoiceActivityProvider>
                  </VisionSettingsProvider>
                </TradeEventsProvider>
              </VisionProvider>
            </AutopilotJournalProvider>
          </JournalProvider>
        </TradingSessionProvider>
      </AgentConfigProvider>
    </AppWorldProvider>
  );
};

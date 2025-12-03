
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
import { DeskProvider } from './DeskContext'; 
import { AutopilotProvider } from './AutopilotContext';
import { VoiceRoomProvider } from './VoiceRoomContext';
import { PlaybookProvider } from './PlaybookContext'; // Phase M
import TradeEventsToJournal from '../components/TradeEventsToJournal';

interface Props {
  children: ReactNode;
}

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
                          <DeskProvider>
                            <AutopilotProvider>
                              <PlaybookProvider> {/* Phase M */}
                                <VoiceRoomProvider>
                                  <TradeEventsToJournal />
                                  {children}
                                </VoiceRoomProvider>
                              </PlaybookProvider>
                            </AutopilotProvider>
                          </DeskProvider>
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

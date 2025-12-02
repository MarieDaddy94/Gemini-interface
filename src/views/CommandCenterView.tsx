
import React from 'react';
import RiskAutopilotPanel from '../components/RiskAutopilotPanel';
import VoiceCommander from '../components/VoiceCommander';
import TraderCoachPanel from '../components/TraderCoachPanel';
import AgentSettingsPanel from '../components/AgentSettingsPanel';
import RoundTablePanel from '../components/RoundTablePanel';
import ChartVisionAgentPanel from '../components/ChartVisionAgentPanel';
import { AutopilotCommand, RiskVerdict } from '../types';

interface CommandCenterViewProps {
  onCommandProposed: (cmd: AutopilotCommand | null, risk?: { verdict: RiskVerdict; comment: string | null }) => void;
}

const CommandCenterView: React.FC<CommandCenterViewProps> = ({ onCommandProposed }) => {
  return (
    <div className="flex-1 min-h-0 flex overflow-hidden h-full">
       {/* Left Column: Controls & Configuration */}
       <div className="flex-1 border-r border-[#2a2e39] overflow-hidden flex flex-col">
          {/* 1. Risk Autopilot (Top Priority) */}
          <div className="flex-[1.5] min-h-0 flex flex-col">
             <RiskAutopilotPanel />
          </div>
          <div className="h-[1px] bg-[#2a2e39] shrink-0" />
          
          {/* 2. Voice Commander (Compact) */}
          <div className="flex-none">
             <VoiceCommander />
          </div>
          <div className="h-[1px] bg-[#2a2e39] shrink-0" />

          {/* 3. Trader Coach */}
          <div className="flex-1 min-h-0 flex flex-col">
             <TraderCoachPanel />
          </div>
          <div className="h-[1px] bg-[#2a2e39] shrink-0" />

          {/* 4. Agent Settings */}
          <div className="flex-[1.5] min-h-0 flex flex-col">
             <AgentSettingsPanel />
          </div>
       </div>

       {/* Right Column: Visual Intelligence */}
       <div className="flex-1 overflow-hidden flex flex-col">
          {/* 1. Round Table Chat */}
          <div className="flex-1 min-h-0 flex flex-col">
             <RoundTablePanel onCommandProposed={onCommandProposed} />
          </div>
          <div className="h-[1px] bg-[#2a2e39] shrink-0" />
          
          {/* 2. Chart Vision */}
          <div className="flex-1 min-h-0 flex flex-col">
             <ChartVisionAgentPanel />
          </div>
       </div>
    </div>
  );
};

export default CommandCenterView;

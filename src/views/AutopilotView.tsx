
import React from 'react';
import AutopilotPanel from '../components/AutopilotPanel';
import { AutopilotCommand, RiskVerdict } from '../types';

interface AutopilotViewProps {
  agentProposedCommand: AutopilotCommand | null;
  agentRiskVerdict: RiskVerdict | null;
  agentRiskComment: string | null;
}

const AutopilotView: React.FC<AutopilotViewProps> = ({ 
  agentProposedCommand, 
  agentRiskVerdict, 
  agentRiskComment 
}) => {
  return (
    <div className="flex-1 min-h-0 h-full">
       <AutopilotPanel 
         agentProposedCommand={agentProposedCommand}
         agentRiskVerdict={agentRiskVerdict}
         agentRiskComment={agentRiskComment}
       />
    </div>
  );
};

export default AutopilotView;

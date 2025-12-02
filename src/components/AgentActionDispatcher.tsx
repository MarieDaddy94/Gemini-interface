import React, { useEffect } from 'react';
import { useAppWorld, AppRoom, AppOverlay } from '../context/AppWorldContext';
import { useDesk } from '../context/DeskContext';
import { useAutopilotContext } from '../context/AutopilotContext';
import { ToolActivityEvent, subscribeToolActivity } from '../services/toolActivityBus';
import { AutopilotCommand, RiskVerdict } from '../types';

const AgentActionDispatcher: React.FC = () => {
  const { actions: appActions } = useAppWorld();
  const { actions: deskActions } = useDesk();
  const { setProposal } = useAutopilotContext();

  useEffect(() => {
    const unsubscribe = subscribeToolActivity((evt: ToolActivityEvent) => {
      
      // 1. UI Control
      if (evt.name === 'control_app_ui' && evt.status === 'ok') {
        const args = evt.args || {};
        if (args.action === 'navigate' && args.target) {
            appActions.openRoom(args.target as AppRoom);
        } else if (args.action === 'overlay' && args.target) {
            appActions.openOverlay(args.target as AppOverlay);
        } else if (args.action === 'toast' && args.message) {
            appActions.showToast(args.message, args.type || 'info');
        }
      }

      // 2. Desk Configuration
      if (evt.name === 'configure_trading_desk' && evt.status === 'ok') {
        const args = evt.args || {};
        if (args.goal) deskActions.setDeskGoal(args.goal);
        if (args.sessionPhase) deskActions.setSessionPhase(args.sessionPhase);
        if (args.assignments) {
            Object.entries(args.assignments).forEach(([roleId, config]: [string, any]) => {
                deskActions.assignRole(roleId as any, {
                    symbolFocus: config.symbolFocus,
                    timeframes: config.timeframes,
                    onDesk: config.onDesk
                });
            });
        }
        appActions.showToast("Desk reconfigured by Agent", "info");
      }

      // 3. Autopilot Proposal from Desk
      if (evt.name === 'commit_autopilot_proposal' && evt.status === 'ok') {
        const args = evt.args || {};
        const rawPlan = args.plan;
        
        if (rawPlan && rawPlan.jsonTradePlan) {
           const tp = rawPlan.jsonTradePlan;
           // Construct command from raw plan
           const command: AutopilotCommand = {
              type: 'open',
              symbol: tp.symbol,
              side: String(tp.direction).toUpperCase() === 'LONG' ? 'BUY' : 'SELL',
              qty: 1.0, // Default or calculate from risk
              entryType: tp.entryType || 'market',
              price: tp.entryPrice || undefined,
              slPrice: tp.stopLoss || undefined,
              tpPrice: tp.takeProfits?.[0]?.level || undefined,
              tradableInstrumentId: 0 // Placeholder
           };

           // Attempt to extract risk verdict if passed or infer
           // Since run_autopilot_review returns { allowed, reasons... }, we can map that
           // but `commit_autopilot_proposal` gets passed the result of that review.
           let riskVerdict: RiskVerdict = 'UNKNOWN';
           if (rawPlan.allowed === true) riskVerdict = 'ALLOW';
           else if (rawPlan.allowed === false) riskVerdict = 'BLOCK';

           setProposal(command, 'desk', {
              verdict: riskVerdict,
              comment: rawPlan.riskNotes || "Proposal from Desk"
           });
           
           appActions.openRoom('autopilot');
           appActions.showToast("New Desk Proposal Staged", "info");
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [appActions, deskActions, setProposal]);

  return null;
};

export default AgentActionDispatcher;
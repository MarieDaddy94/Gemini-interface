
import React, { useEffect } from 'react';
import { useAppWorld, AppRoom, AppOverlay } from '../context/AppWorldContext';
import { useDesk } from '../context/DeskContext';
import { ToolActivityEvent, subscribeToolActivity } from '../services/toolActivityBus';

/**
 * AgentActionDispatcher
 * 
 * This invisible component acts as the bridge between the "Tool Activity Bus"
 * (where backend agent actions are logged) and the "App World" (React state).
 * 
 * When an agent calls `control_app_ui` or `configure_trading_desk`, this component executes it.
 */
const AgentActionDispatcher: React.FC = () => {
  const { actions: appActions } = useAppWorld();
  const { actions: deskActions } = useDesk();

  useEffect(() => {
    // We subscribe directly to the bus service to avoid re-render loops 
    // or dependency on the context array changing.
    const unsubscribe = subscribeToolActivity((evt: ToolActivityEvent) => {
      
      // 1. UI Control
      if (evt.name === 'control_app_ui' && evt.status === 'ok') {
        const args = evt.args || {};
        const action = args.action;
        
        console.log(`[AgentActionDispatcher] UI Action:`, args);

        if (action === 'navigate') {
          if (args.target) {
            appActions.openRoom(args.target as AppRoom);
          }
        } else if (action === 'overlay') {
          if (args.target) {
            appActions.openOverlay(args.target as AppOverlay);
          }
        } else if (action === 'toast') {
          if (args.message) {
            appActions.showToast(args.message, args.type || 'info');
          }
        }
      }

      // 2. Desk Configuration
      if (evt.name === 'configure_trading_desk' && evt.status === 'ok') {
        const args = evt.args || {};
        console.log(`[AgentActionDispatcher] Desk Config:`, args);

        if (args.goal) {
            deskActions.setDeskGoal(args.goal);
        }
        
        if (args.sessionPhase) {
            deskActions.setSessionPhase(args.sessionPhase);
        }

        if (args.assignments) {
            Object.entries(args.assignments).forEach(([roleId, config]: [string, any]) => {
                deskActions.assignRole(roleId as any, {
                    symbolFocus: config.symbolFocus,
                    timeframes: config.timeframes,
                    onDesk: config.onDesk
                });
            });
        }
        
        // Optionally notify user
        appActions.showToast("Desk reconfigured by Agent", "info");
      }
    });

    return () => {
      unsubscribe();
    };
  }, [appActions, deskActions]);

  return null; // Invisible
};

export default AgentActionDispatcher;

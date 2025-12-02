
import React, { useEffect } from 'react';
import { useAppWorld, AppRoom, AppOverlay } from '../context/AppWorldContext';
import { useToolActivity } from '../context/ToolActivityContext';
import { ToolActivityEvent, subscribeToolActivity } from '../services/toolActivityBus';

/**
 * AgentActionDispatcher
 * 
 * This invisible component acts as the bridge between the "Tool Activity Bus"
 * (where backend agent actions are logged) and the "App World" (React state).
 * 
 * When an agent calls `control_app_ui`, this component executes it.
 */
const AgentActionDispatcher: React.FC = () => {
  const { actions } = useAppWorld();

  useEffect(() => {
    // We subscribe directly to the bus service to avoid re-render loops 
    // or dependency on the context array changing.
    const unsubscribe = subscribeToolActivity((evt: ToolActivityEvent) => {
      // We only care about the 'control_app_ui' tool
      if (evt.name !== 'control_app_ui') return;

      // We only execute on 'ok' (completed) or 'pending' if we want immediate reaction.
      // Let's execute on 'pending' to make it feel snappy, or 'ok' to be safe.
      // Since the backend handler is just a pass-through, 'ok' is fine and safer.
      if (evt.status !== 'ok') return;

      const args = evt.args || {};
      const action = args.action;
      
      console.log(`[AgentActionDispatcher] Executing:`, args);

      if (action === 'navigate') {
        if (args.target) {
          // Type guard or cast
          actions.openRoom(args.target as AppRoom);
        }
      } else if (action === 'overlay') {
        if (args.target) {
          actions.openOverlay(args.target as AppOverlay);
        }
      } else if (action === 'toast') {
        if (args.message) {
          actions.showToast(args.message, args.type || 'info');
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [actions]);

  return null; // Invisible
};

export default AgentActionDispatcher;


import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';

/**
 * AppRoom defines the main views of the application.
 * Agents can "navigate" to these rooms.
 */
export type AppRoom =
  | 'terminal'
  | 'command'
  | 'autopilot'
  | 'journal'
  | 'analysis'
  | 'analytics';

/**
 * AppOverlay defines global modals/dialogs.
 */
export type AppOverlay = 'none' | 'broker' | 'settings';

export interface AppWorldState {
  currentRoom: AppRoom;
  activeOverlay: AppOverlay;
}

export interface AppWorldActions {
  openRoom: (room: AppRoom) => void;
  openOverlay: (overlay: AppOverlay) => void;
  closeOverlay: () => void;
}

export interface AppWorldContextValue {
  state: AppWorldState;
  actions: AppWorldActions;
}

const AppWorldContext = createContext<AppWorldContextValue | null>(null);

export const AppWorldProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentRoom, setCurrentRoom] = useState<AppRoom>('terminal');
  const [activeOverlay, setActiveOverlay] = useState<AppOverlay>('none');

  const value = useMemo<AppWorldContextValue>(
    () => ({
      state: {
        currentRoom,
        activeOverlay,
      },
      actions: {
        openRoom: (room) => {
          setCurrentRoom(room);
          // Optional: Close overlay on navigation? 
          // Keeping it open might be useful in some cases, but generally navigating implies focusing on the new view.
          // setActiveOverlay('none'); 
        },
        openOverlay: (overlay) => setActiveOverlay(overlay),
        closeOverlay: () => setActiveOverlay('none'),
      },
    }),
    [currentRoom, activeOverlay]
  );

  return (
    <AppWorldContext.Provider value={value}>
      {children}
    </AppWorldContext.Provider>
  );
};

export const useAppWorld = (): AppWorldContextValue => {
  const ctx = useContext(AppWorldContext);
  if (!ctx) {
    throw new Error('useAppWorld must be used inside an AppWorldProvider');
  }
  return ctx;
};

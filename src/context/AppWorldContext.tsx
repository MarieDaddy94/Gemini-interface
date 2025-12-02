
import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  ReactNode,
  useEffect
} from "react";

/**
 * 1) Rooms = big areas of the app the user/agents can "be" in.
 */
export type AppRoom =
  | "terminal"
  | "tradingRoomFloor" // NEW: The Desk View
  | "command"
  | "autopilot"
  | "journal"
  | "analysis"
  | "analytics";

/**
 * 2) Overlays = global modals/dialogs.
 */
export type AppOverlay = 'none' | 'broker' | 'settings';

export interface ToastMessage {
  id: string;
  msg: string;
  type: 'success' | 'info' | 'error';
}

export interface AppWorldState {
  currentRoom: AppRoom;
  activeOverlay: AppOverlay;
  toast: ToastMessage | null;
}

export interface AppWorldActions {
  openRoom: (room: AppRoom) => void;
  openOverlay: (overlay: AppOverlay) => void;
  closeOverlay: () => void;
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export interface AppWorldContextValue {
  state: AppWorldState;
  actions: AppWorldActions;
}

const AppWorldContext = createContext<AppWorldContextValue | null>(null);

export const AppWorldProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentRoom, setCurrentRoom] = useState<AppRoom>('terminal');
  const [activeOverlay, setActiveOverlay] = useState<AppOverlay>('none');
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const value = useMemo<AppWorldContextValue>(
    () => ({
      state: {
        currentRoom,
        activeOverlay,
        toast,
      },
      actions: {
        openRoom: (room) => setCurrentRoom(room),
        openOverlay: (overlay) => setActiveOverlay(overlay),
        closeOverlay: () => setActiveOverlay('none'),
        showToast: (msg, type = 'info') => {
          setToast({ id: Date.now().toString(), msg, type });
        }
      },
    }),
    [currentRoom, activeOverlay, toast]
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
    throw new Error("useAppWorld must be used inside an AppWorldProvider");
  }
  return ctx;
};

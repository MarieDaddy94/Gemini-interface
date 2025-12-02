
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  subscribeToolActivity,
  ToolActivityEvent,
} from "../services/toolActivityBus";

type ToolActivityContextValue = {
  events: ToolActivityEvent[];
};

const ToolActivityContext = createContext<ToolActivityContextValue | null>(
  null
);

export const ToolActivityProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [events, setEvents] = useState<ToolActivityEvent[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToolActivity((evt) => {
      setEvents((prev) => [evt, ...prev].slice(0, 50)); // Keep last 50 events
    });
    return unsubscribe;
  }, []);

  return (
    <ToolActivityContext.Provider value={{ events }}>
      {children}
    </ToolActivityContext.Provider>
  );
};

export const useToolActivity = (): ToolActivityContextValue => {
  const ctx = useContext(ToolActivityContext);
  if (!ctx) {
    throw new Error(
      "useToolActivity must be used inside a ToolActivityProvider"
    );
  }
  return ctx;
};

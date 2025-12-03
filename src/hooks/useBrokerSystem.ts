
import { useBroker } from '../context/BrokerContext';

export function useBrokerSystem() {
  const { 
    brokerSessionId, 
    brokerData, 
    accounts, 
    activeAccount, 
    connect, 
    disconnect, 
    switchAccount 
  } = useBroker();

  return {
    brokerSessionId,
    brokerData,
    accounts,
    activeAccount,
    connect,
    disconnect,
    switchAccount
  };
}

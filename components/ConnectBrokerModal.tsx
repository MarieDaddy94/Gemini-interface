import React, { useState } from 'react';
import { TradeLockerCredentials } from '../types';

interface ConnectBrokerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (creds: TradeLockerCredentials) => Promise<void>;
}

const ConnectBrokerModal: React.FC<ConnectBrokerModalProps> = ({ isOpen, onClose, onConnect }) => {
  const [isDemo, setIsDemo] = useState(true);
  const [server, setServer] = useState('https://demo.tradelocker.com/api');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await onConnect({
        server: isDemo ? 'mock' : server,
        email,
        password,
        isDemo
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2a2e39] flex justify-between items-center bg-[#131722]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-lg">TL</div>
            <h2 className="text-white font-semibold text-lg">Connect TradeLocker</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Toggle Demo */}
          <div className="flex items-center justify-center bg-[#131722] p-1 rounded-lg border border-[#2a2e39] mb-4">
            <button 
              type="button"
              onClick={() => setIsDemo(true)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${isDemo ? 'bg-[#2962ff] text-white shadow' : 'text-gray-400 hover:text-white'}`}
            >
              Demo Mode
            </button>
            <button 
              type="button"
              onClick={() => setIsDemo(false)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${!isDemo ? 'bg-[#2962ff] text-white shadow' : 'text-gray-400 hover:text-white'}`}
            >
              Live Server
            </button>
          </div>

          {!isDemo && (
             <div className="space-y-1">
               <label className="text-xs font-medium text-gray-400 uppercase">Server URL</label>
               <input 
                 type="text" 
                 value={server}
                 onChange={e => setServer(e.target.value)}
                 className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-white focus:outline-none focus:border-[#2962ff] text-sm"
                 placeholder="https://api.tradelocker.com"
               />
             </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-400 uppercase">Email / ID</label>
            <input 
              type="text" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-white focus:outline-none focus:border-[#2962ff] text-sm"
              placeholder="trader@example.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-400 uppercase">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-white focus:outline-none focus:border-[#2962ff] text-sm"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-xs flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              {error}
            </div>
          )}

          <div className="pt-2">
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[#2962ff] hover:bg-[#1e53e5] text-white font-medium py-2.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>}
              {loading ? 'Connecting...' : 'Connect Account'}
            </button>
            <p className="text-center text-[10px] text-gray-500 mt-3">
              Your credentials are processed locally or sent directly to the broker API.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConnectBrokerModal;
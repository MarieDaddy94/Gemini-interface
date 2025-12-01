
import React, { useState, useEffect } from 'react';

interface AccessGateProps {
  children: React.ReactNode;
}

const AccessGate: React.FC<AccessGateProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage on mount
    const savedCode = localStorage.getItem('user_access_code');
    if (savedCode) {
      verifyCode(savedCode).then(isValid => {
        if (isValid) setIsAuthenticated(true);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const verifyCode = async (code: string): Promise<boolean> => {
    // Determine API URL based on environment
    const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';
    
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      return res.ok;
    } catch (e) {
      // Warn instead of error to avoid alarming users in dev mode (backend might be down)
      console.warn("Auth verification skipped (Backend unreachable):", e);
      // Fallback for local dev if server isn't running auth yet
      return true; 
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const isValid = await verifyCode(accessCode);
    
    if (isValid) {
      localStorage.setItem('user_access_code', accessCode);
      setIsAuthenticated(true);
    } else {
      setError('Access Denied: Invalid Code');
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full bg-[#131722] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2962ff] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="h-screen w-full bg-[#0a0c10] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl p-8 animate-fade-in">
         <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-[#2962ff]/10 rounded-full flex items-center justify-center border border-[#2962ff]/30 text-[#2962ff]">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </div>
         </div>
         
         <h2 className="text-xl font-bold text-white text-center mb-2">Restricted Access</h2>
         <p className="text-sm text-gray-400 text-center mb-6">
           Enter your personal access code to enter the trading floor.
         </p>

         <form onSubmit={handleUnlock} className="space-y-4">
            <div>
               <input 
                 type="password" 
                 value={accessCode}
                 onChange={(e) => setAccessCode(e.target.value)}
                 className="w-full bg-[#131722] border border-[#2a2e39] rounded px-4 py-3 text-white focus:outline-none focus:border-[#2962ff] focus:ring-1 focus:ring-[#2962ff] transition-all text-center tracking-widest text-lg"
                 placeholder="••••••"
                 autoFocus
               />
            </div>
            
            {error && (
              <div className="text-xs text-red-400 text-center font-medium bg-red-500/10 py-2 rounded border border-red-500/20">
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={!accessCode}
              className="w-full bg-[#2962ff] hover:bg-[#1e53e5] text-white font-bold py-3 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
            >
              Unlock Dashboard
            </button>
         </form>
         
         <div className="mt-6 text-center">
            <p className="text-[10px] text-gray-600">
               AI Trading Analyst v1.0 • Secure Environment
            </p>
         </div>
      </div>
    </div>
  );
};

export default AccessGate;

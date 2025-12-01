
import React, { useState, useEffect, useRef } from 'react';
import { useJournal } from '../context/JournalContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { exportJournal, importJournal, entries } = useJournal();
  
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [showKeys, setShowKeys] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setOpenaiKey(localStorage.getItem('openai_api_key') || '');
      setGeminiKey(localStorage.getItem('gemini_api_key') || '');
      setImportStatus('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (openaiKey.trim()) {
      localStorage.setItem('openai_api_key', openaiKey.trim());
    } else {
      localStorage.removeItem('openai_api_key');
    }

    if (geminiKey.trim()) {
      localStorage.setItem('gemini_api_key', geminiKey.trim());
    } else {
      localStorage.removeItem('gemini_api_key');
    }
    onClose();
  };

  const handleClear = () => {
    if (window.confirm("Are you sure you want to clear your saved API keys?")) {
      localStorage.removeItem('openai_api_key');
      localStorage.removeItem('gemini_api_key');
      setOpenaiKey('');
      setGeminiKey('');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await importJournal(file);
      setImportStatus('Success: Journal loaded!');
      e.target.value = ''; // reset
    } catch (err: any) {
      setImportStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2a2e39] flex justify-between items-center bg-[#131722]">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-semibold text-lg">App Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* DATA MANAGEMENT SECTION */}
          <div className="space-y-2 pb-4 border-b border-[#2a2e39]">
            <label className="block text-xs font-medium text-gray-400 uppercase mb-1">
              Data Management
            </label>
            <div className="bg-[#131722] p-3 rounded border border-[#2a2e39] space-y-3">
               <div className="flex items-center justify-between">
                 <div className="text-xs text-gray-300">
                   <span className="font-semibold">{entries.length}</span> journal entries in memory.
                 </div>
                 <div className="flex gap-2">
                    <input 
                      type="file" 
                      accept=".json" 
                      ref={fileInputRef} 
                      className="hidden" 
                      onChange={handleFileChange} 
                    />
                    <button
                      type="button"
                      onClick={handleImportClick}
                      className="text-[10px] bg-[#2a2e39] hover:bg-[#363a45] text-white px-3 py-1.5 rounded transition-colors border border-gray-600"
                    >
                      Import
                    </button>
                    <button
                      type="button"
                      onClick={exportJournal}
                      disabled={entries.length === 0}
                      className="text-[10px] bg-[#2962ff] hover:bg-[#1e53e5] text-white px-3 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Backup
                    </button>
                 </div>
               </div>
               {importStatus && (
                 <div className={`text-[10px] ${importStatus.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                   {importStatus}
                 </div>
               )}
               <p className="text-[10px] text-gray-500 leading-snug">
                 <strong>Tip:</strong> Since this app runs without a database, save backups regularly to avoid losing your journal data if you clear your browser cache.
               </p>
            </div>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded p-3 text-xs text-blue-200">
            <p className="font-semibold mb-1">Bring Your Own Keys (BYOK)</p>
            <p className="opacity-80">
              Keys are stored securely in your browser's LocalStorage and sent directly to the backend proxy for each request.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase mb-1">
                OpenAI API Key
              </label>
              <input
                type={showKeys ? "text" : "password"}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-white focus:outline-none focus:border-[#2962ff] text-sm"
              />
              <p className="text-[10px] text-gray-500 mt-1">Required for Pattern_GPT</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase mb-1">
                Google Gemini API Key
              </label>
              <input
                type={showKeys ? "text" : "password"}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIza..."
                className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-white focus:outline-none focus:border-[#2962ff] text-sm"
              />
              <p className="text-[10px] text-gray-500 mt-1">Required for QuantBot & Coach</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="showKeys" 
              checked={showKeys} 
              onChange={(e) => setShowKeys(e.target.checked)} 
              className="rounded bg-[#131722] border-[#2a2e39]"
            />
            <label htmlFor="showKeys" className="text-xs text-gray-400 cursor-pointer select-none">Show API Keys</label>
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-2 rounded text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-colors"
            >
              Clear Keys
            </button>
            <button
              type="submit"
              className="flex-1 bg-[#2962ff] hover:bg-[#1e53e5] text-white font-medium py-2 rounded transition-colors shadow-lg shadow-blue-500/20"
            >
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsModal;


import React, { useState, useEffect, useRef } from 'react';
import { useJournal } from '../context/JournalContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { exportJournal, importJournal, entries } = useJournal();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setImportStatus('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
        <div className="p-6 space-y-5">
          {/* DATA MANAGEMENT SECTION */}
          <div className="space-y-2 pb-4">
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
                 <strong>Important:</strong> This app runs in your browser. Regularly back up your trading journal to avoid data loss if you clear your cache.
               </p>
            </div>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded p-3 text-xs text-blue-200">
            <p className="font-semibold mb-1">Live Trading Mode</p>
            <p className="opacity-80">
              API keys are securely managed by the server environment. Ensure your backend is configured with <code>process.env.API_KEY</code>.
            </p>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#2962ff] hover:bg-[#1e53e5] text-white font-medium rounded transition-colors shadow-lg shadow-blue-500/20 text-sm"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;

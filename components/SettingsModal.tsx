
import React, { useState, useEffect, useRef } from 'react';
import { useJournal } from '../context/JournalContext';
import { useAgentConfig, AgentConfig } from '../context/AgentConfigContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AGENTS_META = [
  { id: 'quant_bot', name: 'QuantBot', avatar: '🤖', description: 'Logic & Stats' },
  { id: 'trend_master', name: 'TrendMaster', avatar: '📈', description: 'Trends & Structure' },
  { id: 'pattern_gpt', name: 'Pattern_GPT', avatar: '🧠', description: 'Charts & Patterns' },
  { id: 'journal_coach', name: 'Journal Coach', avatar: '🎓', description: 'Review & Psychology' }
];

const AVAILABLE_PROVIDERS = ['gemini', 'openai'];

const AVAILABLE_MODELS = {
  gemini: ['gemini-2.5-flash', 'gemini-3-pro-preview', 'gemini-2.5-flash-thinking'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o3-mini']
};

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { exportJournal, importJournal, entries } = useJournal();
  const { agentConfigs, updateAgentConfig, resetToDefaults } = useAgentConfig();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'general' | 'ai'>('general');

  // API Key State
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [showKeys, setShowKeys] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setImportStatus('');
      // Load keys from local storage if available
      if (typeof window !== 'undefined') {
        setOpenaiKey(window.localStorage.getItem('openai_api_key') || '');
        setGeminiKey(window.localStorage.getItem('gemini_api_key') || '');
      }
    }
  }, [isOpen]);

  const handleSaveKeys = () => {
    if (typeof window !== 'undefined') {
      if (openaiKey) window.localStorage.setItem('openai_api_key', openaiKey);
      else window.localStorage.removeItem('openai_api_key');

      if (geminiKey) window.localStorage.setItem('gemini_api_key', geminiKey);
      else window.localStorage.removeItem('gemini_api_key');
    }
    alert('API Keys saved locally.');
  };

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
      <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2a2e39] flex justify-between items-center bg-[#131722] shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-semibold text-lg">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2a2e39] bg-[#1e222d] shrink-0">
           <button 
             onClick={() => setActiveTab('general')}
             className={`px-4 py-3 text-xs font-medium transition-colors border-b-2 ${activeTab === 'general' ? 'border-[#2962ff] text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
           >
             General & Data
           </button>
           <button 
             onClick={() => setActiveTab('ai')}
             className={`px-4 py-3 text-xs font-medium transition-colors border-b-2 ${activeTab === 'ai' ? 'border-[#2962ff] text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
           >
             AI Squad Configuration
           </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          
          {activeTab === 'general' && (
            <>
              {/* API KEYS SECTION */}
              <div className="space-y-3 pb-4 border-b border-[#2a2e39]">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-gray-400 uppercase">
                    API Key Management
                  </label>
                  <button 
                    onClick={() => setShowKeys(!showKeys)}
                    className="text-[10px] text-blue-400 hover:text-blue-300"
                  >
                    {showKeys ? 'Hide Keys' : 'Show Keys'}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500">OpenAI API Key</span>
                    <input 
                      type={showKeys ? "text" : "password"} 
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-[#2962ff]"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500">Google Gemini API Key</span>
                    <input 
                      type={showKeys ? "text" : "password"} 
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="AIza..."
                      className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-[#2962ff]"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                   <button 
                     onClick={handleSaveKeys}
                     className="text-[10px] bg-[#2a2e39] hover:bg-[#363a45] text-white px-3 py-1.5 rounded transition-colors border border-gray-600"
                   >
                     Save Keys Locally
                   </button>
                </div>
                <p className="text-[10px] text-gray-500 italic">
                  Keys are stored in your browser's LocalStorage and sent directly to the backend proxy.
                </p>
              </div>

              {/* DATA MANAGEMENT SECTION */}
              <div className="space-y-2">
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
            </>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400">
                  Configure models and creativity for your autopilot agents.
                </p>
                <button 
                  onClick={resetToDefaults}
                  className="text-[10px] text-gray-500 hover:text-white underline"
                >
                  Reset Defaults
                </button>
              </div>

              <div className="grid gap-3">
                {AGENTS_META.map(agent => {
                  const config = agentConfigs[agent.id] || { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.5 };
                  
                  return (
                    <div key={agent.id} className="bg-[#131722] border border-[#2a2e39] rounded p-4 flex flex-col gap-3">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded bg-[#1e222d] border border-[#2a2e39] flex items-center justify-center text-xl shrink-0">
                            {agent.avatar}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
                            <p className="text-[10px] text-gray-500">{agent.description}</p>
                          </div>
                       </div>

                       <div className="grid grid-cols-2 gap-4 pl-14">
                          {/* Provider Select */}
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold">Provider</label>
                            <div className="relative">
                              <select
                                value={config.provider}
                                onChange={(e) => updateAgentConfig(agent.id, { 
                                  provider: e.target.value as any,
                                  model: AVAILABLE_MODELS[e.target.value as 'gemini' | 'openai'][0] 
                                })}
                                className="w-full bg-[#1e222d] border border-[#2a2e39] text-gray-300 text-[10px] rounded px-2 py-1.5 focus:outline-none focus:border-[#2962ff] appearance-none"
                              >
                                {AVAILABLE_PROVIDERS.map(p => (
                                  <option key={p} value={p}>{p === 'openai' ? 'OpenAI' : 'Google Gemini'}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Model Select */}
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold">Model</label>
                            <div className="relative">
                              <select
                                value={config.model}
                                onChange={(e) => updateAgentConfig(agent.id, { model: e.target.value })}
                                className="w-full bg-[#1e222d] border border-[#2a2e39] text-gray-300 text-[10px] rounded px-2 py-1.5 focus:outline-none focus:border-[#2962ff] appearance-none"
                              >
                                {AVAILABLE_MODELS[config.provider].map(m => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Temperature Slider */}
                          <div className="col-span-2 space-y-1">
                             <div className="flex justify-between">
                                <label className="text-[10px] text-gray-500 uppercase font-semibold">Creativity (Temp)</label>
                                <span className="text-[10px] text-blue-400 font-mono">{config.temperature.toFixed(1)}</span>
                             </div>
                             <input 
                               type="range" 
                               min="0" 
                               max="1" 
                               step="0.1" 
                               value={config.temperature}
                               onChange={(e) => updateAgentConfig(agent.id, { temperature: parseFloat(e.target.value) })}
                               className="w-full h-1 bg-[#2a2e39] rounded-lg appearance-none cursor-pointer accent-[#2962ff]"
                             />
                             <div className="flex justify-between text-[9px] text-gray-600">
                                <span>Precise</span>
                                <span>Creative</span>
                             </div>
                          </div>
                       </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 flex justify-end shrink-0">
           <button
             onClick={onClose}
             className="px-4 py-2 bg-[#2962ff] hover:bg-[#1e53e5] text-white font-medium rounded transition-colors shadow-lg shadow-blue-500/20 text-sm"
           >
             Done
           </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;

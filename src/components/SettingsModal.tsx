
import React, { useState, useEffect, useRef } from 'react';
import { useJournal } from '../context/JournalContext';
import { useAgentConfig } from '../context/AgentConfigContext';
import { modelConfigService, ModelConfigState } from '../services/modelConfig';
import VisionSettingsPanel from './VisionSettingsPanel';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { exportJournal, importJournal, entries } = useJournal();
  const { agentConfigs, updateAgentConfig, resetToDefaults } = useAgentConfig();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'general' | 'ai' | 'models' | 'vision'>('general');

  // Model Config
  const [modelConfig, setModelConfig] = useState<ModelConfigState>(modelConfigService.getConfig());

  // API Key State
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [showKeys, setShowKeys] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setImportStatus('');
      setModelConfig(modelConfigService.getConfig());
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

  const handleModelChange = (role: keyof ModelConfigState, field: 'provider' | 'model', value: string) => {
      const newState = { ...modelConfig, [role]: { ...modelConfig[role], [field]: value } };
      setModelConfig(newState);
      modelConfigService.updateConfig(newState);
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
        <div className="flex border-b border-[#2a2e39] bg-[#1e222d] shrink-0 text-xs">
           <button onClick={() => setActiveTab('general')} className={`px-4 py-3 border-b-2 ${activeTab === 'general' ? 'border-[#2962ff] text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>General</button>
           <button onClick={() => setActiveTab('models')} className={`px-4 py-3 border-b-2 ${activeTab === 'models' ? 'border-[#2962ff] text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>AI Brain</button>
           <button onClick={() => setActiveTab('ai')} className={`px-4 py-3 border-b-2 ${activeTab === 'ai' ? 'border-[#2962ff] text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>Agents</button>
           <button onClick={() => setActiveTab('vision')} className={`px-4 py-3 border-b-2 ${activeTab === 'vision' ? 'border-[#2962ff] text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>Vision</button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          
          {activeTab === 'general' && (
            <>
              {/* API KEYS */}
              <div className="space-y-3 pb-4 border-b border-[#2a2e39]">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-gray-400 uppercase">API Key Management</label>
                  <button onClick={() => setShowKeys(!showKeys)} className="text-[10px] text-blue-400 hover:text-blue-300">{showKeys ? 'Hide' : 'Show'}</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500">OpenAI API Key</span>
                    <input 
                      type={showKeys ? "text" : "password"} 
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-white text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500">Google Gemini API Key</span>
                    <input 
                      type={showKeys ? "text" : "password"} 
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="AIza..."
                      className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-white text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                   <button onClick={handleSaveKeys} className="text-[10px] bg-[#2a2e39] hover:bg-[#363a45] text-white px-3 py-1.5 rounded transition-colors border border-gray-600">Save Keys</button>
                </div>
              </div>

              {/* DATA */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">Data Management</label>
                <div className="bg-[#131722] p-3 rounded border border-[#2a2e39] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-300"><span className="font-semibold">{entries.length}</span> journal entries.</div>
                    <div className="flex gap-2">
                        <input type="file" accept=".json" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                        <button type="button" onClick={handleImportClick} className="text-[10px] bg-[#2a2e39] hover:bg-[#363a45] text-white px-3 py-1.5 rounded border border-gray-600">Import</button>
                        <button type="button" onClick={exportJournal} disabled={entries.length === 0} className="text-[10px] bg-[#2962ff] hover:bg-[#1e53e5] text-white px-3 py-1.5 rounded">Backup</button>
                    </div>
                  </div>
                  {importStatus && <div className={`text-[10px] ${importStatus.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{importStatus}</div>}
                </div>
              </div>
            </>
          )}

          {activeTab === 'models' && (
              <div className="space-y-4">
                  <p className="text-xs text-gray-400">Assign specific models to desk roles. The "Voice" setting determines which Realtime API handles your voice room.</p>
                  <div className="grid grid-cols-1 gap-2">
                      {Object.keys(modelConfig).map(roleKey => {
                          const role = roleKey as keyof ModelConfigState;
                          const cfg = modelConfig[role];
                          return (
                              <div key={role} className="flex items-center justify-between bg-[#131722] p-2 rounded border border-[#2a2e39]">
                                  <span className="text-xs font-bold text-gray-300 uppercase w-32">{role}</span>
                                  <div className="flex gap-2 flex-1">
                                      <select 
                                        value={cfg.provider} 
                                        onChange={(e) => handleModelChange(role, 'provider', e.target.value)}
                                        className="bg-[#0b0e14] text-xs border border-gray-700 rounded px-2 py-1 w-24"
                                      >
                                          <option value="gemini">Gemini</option>
                                          <option value="openai">OpenAI</option>
                                      </select>
                                      <input 
                                        value={cfg.model} 
                                        onChange={(e) => handleModelChange(role, 'model', e.target.value)}
                                        className="bg-[#0b0e14] text-xs border border-gray-700 rounded px-2 py-1 flex-1 font-mono"
                                      />
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400">Detailed agent tuning (creativity/temperature).</p>
                <button onClick={resetToDefaults} className="text-[10px] text-gray-500 hover:text-white underline">Reset Defaults</button>
              </div>
              {/* Agent list (simplified for brevity) */}
              <div className="text-xs text-gray-500 italic">Use the "AI Brain" tab to select models. Use this tab for prompt tuning (coming soon).</div>
            </div>
          )}

          {activeTab === 'vision' && <VisionSettingsPanel />}
        </div>

        <div className="p-6 pt-0 flex justify-end shrink-0">
           <button onClick={onClose} className="px-4 py-2 bg-[#2962ff] hover:bg-[#1e53e5] text-white font-medium rounded shadow-lg text-sm">Done</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;

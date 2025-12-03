
import React, { useState, useEffect } from 'react';
import { Playbook, PlaybookKind, PlaybookTier, PlaybookTrigger } from '../types';
import { usePlaybooks } from '../context/PlaybookContext';

interface Props {
  playbook?: Playbook | null;
  onClose: () => void;
}

const PlaybookDesigner: React.FC<Props> = ({ playbook, onClose }) => {
  const { createPlaybook, updatePlaybook } = usePlaybooks();
  
  const [formData, setFormData] = useState<Partial<Playbook>>({
    name: "",
    symbol: "US30",
    timeframe: "15m",
    kind: "intraday",
    tier: "experimental",
    trigger: "liquidity_sweep",
    riskTemplate: { baseRiskR: 0.5 },
    rulesText: "- Entry:\n- Stop Loss:\n- Take Profit:",
    tags: []
  });

  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (playbook) {
      setFormData(playbook);
    }
  }, [playbook]);

  const handleChange = (field: keyof Playbook, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleRiskChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      riskTemplate: { ...prev.riskTemplate, [field]: parseFloat(value) }
    }));
  };

  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    setFormData(prev => ({
      ...prev,
      tags: [...(prev.tags || []), tagInput.trim()]
    }));
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: (prev.tags || []).filter(t => t !== tag)
    }));
  };

  const handleSave = async () => {
    if (!formData.name) return;
    if (playbook) {
      await updatePlaybook(playbook.id, formData);
    } else {
      await createPlaybook(formData);
    }
    onClose();
  };

  return (
    <div className="h-full flex flex-col bg-[#101216] border-l border-gray-800 p-4 overflow-y-auto">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-800">
        <h2 className="text-sm font-bold text-gray-200">
          {playbook ? "Edit Playbook" : "New Playbook"}
        </h2>
        <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
      </div>

      <div className="space-y-4 text-xs">
        
        {/* Basic Info */}
        <div className="space-y-2">
          <label className="block text-gray-400">Playbook Name</label>
          <input 
            className="w-full bg-[#050509] border border-gray-700 rounded px-2 py-1.5 focus:border-blue-500 outline-none text-white"
            value={formData.name}
            onChange={e => handleChange("name", e.target.value)}
            placeholder="e.g. US30 NY Liquidity Sweep"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-gray-400 mb-1">Symbol</label>
            <input 
              className="w-full bg-[#050509] border border-gray-700 rounded px-2 py-1 focus:border-blue-500 outline-none text-white"
              value={formData.symbol}
              onChange={e => handleChange("symbol", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-gray-400 mb-1">Timeframe</label>
            <input 
              className="w-full bg-[#050509] border border-gray-700 rounded px-2 py-1 focus:border-blue-500 outline-none text-white"
              value={formData.timeframe}
              onChange={e => handleChange("timeframe", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-gray-400 mb-1">Tier</label>
            <select 
              className="w-full bg-[#050509] border border-gray-700 rounded px-2 py-1 text-white"
              value={formData.tier}
              onChange={e => handleChange("tier", e.target.value)}
            >
              <option value="experimental">Exp</option>
              <option value="C">C</option>
              <option value="B">B</option>
              <option value="A">A</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-400 mb-1">Kind</label>
            <select 
              className="w-full bg-[#050509] border border-gray-700 rounded px-2 py-1 text-white"
              value={formData.kind}
              onChange={e => handleChange("kind", e.target.value)}
            >
              <option value="scalp">Scalp</option>
              <option value="intraday">Intraday</option>
              <option value="swing">Swing</option>
              <option value="news">News</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-400 mb-1">Trigger</label>
            <select 
              className="w-full bg-[#050509] border border-gray-700 rounded px-2 py-1 text-white"
              value={formData.trigger}
              onChange={e => handleChange("trigger", e.target.value)}
            >
              <option value="liquidity_sweep">Sweep</option>
              <option value="breakout_retest">Breakout</option>
              <option value="trend_continuation">Trend</option>
              <option value="mean_reversion">Mean Rev</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>

        {/* Risk */}
        <div className="p-2 bg-black/20 rounded border border-gray-800">
          <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">Risk Template</div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Base Risk:</span>
            <input 
              type="number" step="0.1"
              className="w-16 bg-[#050509] border border-gray-700 rounded px-1 py-0.5 text-center text-white"
              value={formData.riskTemplate?.baseRiskR}
              onChange={e => handleRiskChange("baseRiskR", e.target.value)}
            />
            <span className="text-gray-500">% / R</span>
          </div>
        </div>

        {/* Rules */}
        <div className="flex-1 flex flex-col min-h-0">
          <label className="block text-gray-400 mb-1">Rules & Execution</label>
          <textarea 
            className="flex-1 w-full bg-[#050509] border border-gray-700 rounded px-2 py-2 text-white resize-none font-mono text-[11px] leading-relaxed focus:border-blue-500 outline-none min-h-[150px]"
            value={formData.rulesText}
            onChange={e => handleChange("rulesText", e.target.value)}
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-gray-400 mb-1">Tags</label>
          <div className="flex gap-2 mb-2">
            <input 
              className="flex-1 bg-[#050509] border border-gray-700 rounded px-2 py-1 text-white"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddTag()}
              placeholder="New tag..."
            />
            <button onClick={handleAddTag} className="px-3 bg-gray-700 hover:bg-gray-600 rounded text-white">+</button>
          </div>
          <div className="flex flex-wrap gap-1">
            {formData.tags?.map(t => (
              <span key={t} className="px-2 py-0.5 bg-blue-900/30 text-blue-200 rounded border border-blue-800/50 flex items-center gap-1">
                {t}
                <button onClick={() => handleRemoveTag(t)} className="hover:text-white ml-1">×</button>
              </span>
            ))}
          </div>
        </div>

        <div className="pt-4 mt-auto">
          <button 
            onClick={handleSave}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded shadow-lg shadow-blue-900/20"
          >
            {playbook ? "Save Changes" : "Create Playbook"}
          </button>
        </div>

      </div>
    </div>
  );
};

export default PlaybookDesigner;

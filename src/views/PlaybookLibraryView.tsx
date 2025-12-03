
import React, { useState } from 'react';
import { usePlaybooks } from '../context/PlaybookContext';
import PlaybookCard from '../components/PlaybookCard';
import PlaybookDesigner from '../components/PlaybookDesigner';
import { Playbook } from '../types';

const PlaybookLibraryView: React.FC = () => {
  const { playbooks, loading, refreshStats } = usePlaybooks();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  // Filters
  const [symbolFilter, setSymbolFilter] = useState("All");
  const [tierFilter, setTierFilter] = useState("All");

  const filteredPlaybooks = playbooks.filter(p => {
    if (symbolFilter !== "All" && p.symbol !== symbolFilter) return false;
    if (tierFilter !== "All" && p.tier !== tierFilter) return false;
    return true;
  });

  const activePlaybook = editingId ? playbooks.find(p => p.id === editingId) : null;

  return (
    <div className="flex h-full bg-[#0b0e14] text-gray-200 overflow-hidden">
      {/* Main Library Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-4 border-b border-gray-800 bg-[#131722] flex justify-between items-center shrink-0">
          <div>
            <h1 className="text-xl font-bold text-white">Playbook Factory</h1>
            <p className="text-xs text-gray-400">Manage your trading setups and strategies.</p>
          </div>
          <button 
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wide rounded shadow-md"
          >
            + New Playbook
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-800 flex gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Symbol:</span>
            <select 
              className="bg-[#050509] border border-gray-700 rounded px-2 py-1 text-gray-300 outline-none focus:border-blue-500"
              value={symbolFilter}
              onChange={e => setSymbolFilter(e.target.value)}
            >
              <option value="All">All</option>
              <option value="US30">US30</option>
              <option value="NAS100">NAS100</option>
              <option value="XAUUSD">XAUUSD</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Tier:</span>
            <select 
              className="bg-[#050509] border border-gray-700 rounded px-2 py-1 text-gray-300 outline-none focus:border-blue-500"
              value={tierFilter}
              onChange={e => setTierFilter(e.target.value)}
            >
              <option value="All">All</option>
              <option value="A">Tier A</option>
              <option value="B">Tier B</option>
              <option value="C">Tier C</option>
              <option value="experimental">Experimental</option>
            </select>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && <div className="text-center text-gray-500">Loading playbooks...</div>}
          
          {!loading && filteredPlaybooks.length === 0 && (
            <div className="text-center text-gray-500 mt-10">No playbooks found. Create one to get started.</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPlaybooks.map(pb => (
              <PlaybookCard 
                key={pb.id} 
                playbook={pb} 
                onClick={() => setEditingId(pb.id)}
                onRefreshStats={refreshStats}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Designer Side Panel */}
      {(isCreating || editingId) && (
        <div className="w-[400px] border-l border-gray-800 shadow-2xl relative z-10">
          <PlaybookDesigner 
            playbook={activePlaybook} 
            onClose={() => {
              setIsCreating(false);
              setEditingId(null);
            }} 
          />
        </div>
      )}
    </div>
  );
};

export default PlaybookLibraryView;

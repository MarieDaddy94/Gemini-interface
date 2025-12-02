
import React from 'react';
import ModelLineupCard from '../components/ModelLineupCard';
import SessionTimeline from '../components/SessionTimeline';

const ModelLabView: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-[#050509] text-gray-200 p-6 overflow-y-auto">
      <div className="mb-6">
          <h1 className="text-xl font-bold mb-1">Model Lab & Desk Memory</h1>
          <p className="text-gray-400 text-sm">
            Self-optimizing AI lineup and narrative session tracking.
          </p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full min-h-0">
        <div className="flex flex-col gap-6">
            <section>
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">AI Team Lineup</h2>
                <ModelLineupCard />
            </section>
            
            <div className="bg-[#161a25] border border-gray-800 rounded-lg p-6 flex flex-col items-center justify-center text-center">
                <span className="text-4xl mb-2">🧪</span>
                <h3 className="font-bold text-gray-200 mb-1">A/B Testing</h3>
                <p className="text-xs text-gray-500">
                    The system is currently passive. Enable "Auto-Apply" in settings to let the desk self-promote models without approval.
                </p>
            </div>
        </div>

        <div className="h-[600px] lg:h-auto">
            <SessionTimeline />
        </div>
      </div>
    </div>
  );
};

export default ModelLabView;

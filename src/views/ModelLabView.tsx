
import React from 'react';

const ModelLabView: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-[#050509] text-gray-200 p-6">
      <h1 className="text-xl font-bold mb-4">Model Lab (Phase I Experimentation)</h1>
      <p className="text-gray-400 text-sm mb-8">
        Compare performance between Gemini and OpenAI models across different trading roles and playbooks.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-[#161a25] border border-gray-800 rounded-lg p-6 flex flex-col items-center justify-center text-center">
           <span className="text-4xl mb-2">📊</span>
           <h3 className="font-bold text-gray-200 mb-1">Performance by Model</h3>
           <p className="text-xs text-gray-500">Coming soon: Track PnL and Win Rate split by AI provider.</p>
        </div>

        <div className="bg-[#161a25] border border-gray-800 rounded-lg p-6 flex flex-col items-center justify-center text-center">
           <span className="text-4xl mb-2">🧪</span>
           <h3 className="font-bold text-gray-200 mb-1">A/B Testing</h3>
           <p className="text-xs text-gray-500">Coming soon: Automatically rotate models for specific playbooks.</p>
        </div>

        <div className="bg-[#161a25] border border-gray-800 rounded-lg p-6 flex flex-col items-center justify-center text-center">
           <span className="text-4xl mb-2">👁️</span>
           <h3 className="font-bold text-gray-200 mb-1">Vision Accuracy</h3>
           <p className="text-xs text-gray-500">Coming soon: Compare Gemini Flash vs GPT-4o on chart reading.</p>
        </div>
      </div>
    </div>
  );
};

export default ModelLabView;

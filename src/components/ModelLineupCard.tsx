
import React, { useEffect, useState } from 'react';
import { modelLabApi, ModelPolicy, ModelRecommendation } from '../services/modelLabApi';

const ModelLineupCard: React.FC = () => {
    const [policy, setPolicy] = useState<ModelPolicy | null>(null);
    const [recs, setRecs] = useState<ModelRecommendation[]>([]);
    const [loading, setLoading] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const p = await modelLabApi.getActivePolicy();
            setPolicy(p);
            const r = await modelLabApi.getRecommendations();
            setRecs(r.recommendations);
        } catch(e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const applyRec = async (rec: ModelRecommendation) => {
        await modelLabApi.applyRecommendation(rec);
        await loadData(); // refresh
    };

    if (!policy) return <div className="text-xs text-gray-500">Loading AI lineup...</div>;

    return (
        <div className="flex flex-col gap-4">
            <div className="bg-[#161a25] border border-gray-800 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-bold text-gray-200">Active AI Lineup</h3>
                    <button onClick={loadData} className="text-[10px] text-blue-400">{loading ? '...' : 'Refresh'}</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(policy.lineup).map(([role, model]) => {
                        // Type assertion to handle Object.entries inference
                        const m = model as { provider: string; model: string };
                        return (
                            <div key={role} className="bg-black/40 p-2 rounded border border-gray-700">
                                <div className="text-[10px] uppercase font-bold text-gray-500 mb-1">{role}</div>
                                <div className="text-xs text-white font-mono">{m.model}</div>
                                <div className="text-[9px] text-gray-400">{m.provider}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {recs.length > 0 && (
                <div className="bg-indigo-900/10 border border-indigo-500/30 rounded-lg p-4">
                    <h3 className="text-sm font-bold text-indigo-300 mb-3">Optimization Recommendations</h3>
                    <div className="space-y-2">
                        {recs.map((rec, i) => (
                            <div key={i} className="flex justify-between items-center bg-black/40 p-2 rounded border border-indigo-500/20">
                                <div>
                                    <div className="text-xs font-bold text-white flex gap-2 items-center">
                                        <span className="uppercase text-gray-400">{rec.role}</span>
                                        <span className="text-indigo-400">→</span>
                                        <span>{rec.to.model}</span>
                                    </div>
                                    <div className="text-[10px] text-gray-400 mt-1 max-w-md">{rec.reason}</div>
                                </div>
                                <button 
                                    onClick={() => applyRec(rec)}
                                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] rounded uppercase font-bold"
                                >
                                    Apply
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ModelLineupCard;

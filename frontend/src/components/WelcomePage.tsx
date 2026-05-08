'use client';
import { api } from '@/lib/api';

export default function WelcomePage() {
  const handleBegin = async () => {
    await api.simulate();
    // No navigation. Root page re-renders on next poll (≤4 s).
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <p className="text-accent text-label tracking-label uppercase mb-6">
        LabMind
      </p>
      <h1 className="text-primary text-4xl font-light text-center mb-4">
        Autonomous experiment optimization
      </h1>
      <p className="text-secondary text-sm font-light text-center max-w-md mb-3">
        AI-guided mRNA-LNP parameter optimization. Each batch is analyzed by a
        LangChain agent that proposes the next experimental conditions.
      </p>
      <p className="text-muted text-sm font-light text-center max-w-md mb-10">
        Upload a completed batch of fluorescence microscopy images → the AI agent
        analyzes GFP transfection efficiency across all wells → proposes optimized
        parameters for the next batch. Review, chat, and approve — then repeat.
      </p>
      <button
        onClick={handleBegin}
        className="border border-accent text-accent px-8 py-3 text-sm tracking-widest uppercase hover:bg-accent hover:text-background transition-colors duration-200"
      >
        Begin Experiment Batch
      </button>
    </div>
  );
}

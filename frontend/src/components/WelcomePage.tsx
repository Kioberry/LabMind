'use client';
import { api } from '@/lib/api';

export default function WelcomePage() {
  const handleBegin = async () => {
    await api.simulate();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">

      {/* Orbital background — centered, very faint */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "url('/background.svg')",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center center',
          backgroundSize: '90vh auto',
          opacity: 0.18,
        }}
      />

      {/* Corner targeting marks */}
      <div className="absolute top-8 left-8 w-5 h-5 border-t border-l border-accent pointer-events-none" style={{ opacity: 0.3 }} />
      <div className="absolute top-8 right-8 w-5 h-5 border-t border-r border-accent pointer-events-none" style={{ opacity: 0.3 }} />
      <div className="absolute bottom-8 left-8 w-5 h-5 border-b border-l border-accent pointer-events-none" style={{ opacity: 0.3 }} />
      <div className="absolute bottom-8 right-8 w-5 h-5 border-b border-r border-accent pointer-events-none" style={{ opacity: 0.3 }} />

      {/* Top system indicator */}
      <div
        className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-3 animate-fadeIn"
        style={{ animationFillMode: 'backwards', animationDelay: '0ms' }}
      >
        <span
          className="text-accent"
          style={{ fontSize: '8px', letterSpacing: '0.3em', fontFamily: 'monospace', opacity: 0.45 }}
        >
          SYSTEM ONLINE
        </span>
        <span className="w-1 h-1 rounded-full bg-accent animate-pulse" style={{ opacity: 0.5 }} />
      </div>

      {/* Hero block */}
      <div className="flex flex-col items-center relative z-10 w-full px-10">

        

        {/* LABMIND */}
        <h1
          className="font-light text-center leading-none text-accent animate-fadeIn mb-6"
          style={{
            fontSize: 'clamp(0.8rem, 1.5vw, 1.4rem)',
            letterSpacing: '0.45em',
            animationFillMode: 'backwards',
            animationDelay: '200ms',
          }}
        >
          LABMIND
        </h1>

        {/* Top rule */}
        <div
          className="flex items-center gap-3 w-full mb-10 animate-fadeIn"
          style={{ maxWidth: 860, animationFillMode: 'backwards', animationDelay: '100ms' }}
        >
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(200,169,110,0.28) 100%)' }} />
          <div className="w-[5px] h-[5px] border border-accent rotate-45 flex-shrink-0" style={{ opacity: 0.55 }} />
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(200,169,110,0.28) 0%, transparent 100%)' }} />
        </div>

        {/* Welcome sentence */}
        <p
          className="text-primary font-light text-center animate-fadeIn"
          style={{
            fontSize: 'clamp(1.4rem, 3.2vw, 2.6rem)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            textShadow: '0 0 60px rgba(200,169,110,0.08)',
            animationFillMode: 'backwards',
            animationDelay: '400ms',
          }}
        >
          Autonomous Experiment Optimization
        </p>

        {/* Bottom rule */}
        <div
          className="flex items-center gap-3 w-full mt-10 mb-9 animate-fadeIn"
          style={{ maxWidth: 860, animationFillMode: 'backwards', animationDelay: '300ms' }}
        >
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(200,169,110,0.28) 100%)' }} />
          <div className="w-[5px] h-[5px] border border-accent rotate-45 flex-shrink-0" style={{ opacity: 0.55 }} />
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(200,169,110,0.28) 0%, transparent 100%)' }} />
        </div>

        {/* One-line descriptor */}
        <p
          className="text-muted font-light text-center mt-3 mb-12 animate-fadeIn"
          style={{
            fontSize: '0.7rem',
            letterSpacing: '0.12em',
            animationFillMode: 'backwards',
            animationDelay: '500ms',
          }}
        >
          AI-guided mRNA-LNP parameter optimization
        </p>

        {/* CTA */}
        <button
          onClick={handleBegin}
          className="border border-accent text-accent font-light hover:bg-accent hover:text-background transition-colors duration-300 animate-fadeIn"
          style={{
            padding: '0.85rem 2.75rem',
            fontSize: '1.1rem',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            animationFillMode: 'backwards',
            animationDelay: '600ms',
          }}
        >
          Begin Experiment Batch
        </button>

      </div>

      {/* Bottom batch indicator */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-fadeIn"
        style={{ animationFillMode: 'backwards', animationDelay: '700ms' }}
      >
        <span
          className="text-muted"
          style={{ fontSize: '8px', letterSpacing: '0.22em', fontFamily: 'monospace', opacity: 0.4 }}
        >
          BATCH OPTIMIZATION ENGINE
        </span>
      </div>

    </div>
  );
}

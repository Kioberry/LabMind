# LabMind — Frontend Implementation Guide

**Version:** 1.0  
**Source of truth:** `docs/software-architecture.md`  
**Purpose:** Step-by-step build guide for the Next.js frontend. An engineer reading only this document and `software-architecture.md` can build and deploy the complete frontend without any other reference.

---

## 1. Exact Dependencies

**Charting library decision:** None required. The convergence trend line is a raw inline SVG `<polyline>`. Computing 2–10 normalized (x, y) points from `best_transfection_rate[]` and joining them as a gold polyline takes ~15 lines of TypeScript. No charting library (even the lightest, `recharts` at ~400 KB) is justified for a single static line with no axes, no labels, and no interactivity.

**Complete `frontend/package.json`:**

```json
{
  "name": "labmind-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "15.3.2",
    "react": "19.1.0",
    "react-dom": "19.1.0"
  },
  "devDependencies": {
    "typescript": "5.8.3",
    "tailwindcss": "3.4.17",
    "postcss": "8.5.3",
    "autoprefixer": "10.4.21",
    "@types/node": "22.15.3",
    "@types/react": "19.1.2",
    "@types/react-dom": "19.1.2",
    "eslint": "9.27.0",
    "eslint-config-next": "15.3.2"
  }
}
```

---

## 2. Project Bootstrap

Run from the **LabMind repo root** (the directory containing `backend/` and `frontend/`):

```bash
npx create-next-app@15.3.2 frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-npm
```

Replace the scaffolded `package.json` entirely with the content in Section 1, then re-install to pin versions:

```bash
cd frontend
npm install
```

Verify:

```bash
npx next --version
# Expected: 15.3.2
```

**Replace `frontend/tailwind.config.ts`** with the following complete file. This registers all design tokens as Tailwind utility classes (`bg-background`, `bg-surface`, `border-surface-border`, `text-accent`, `text-primary`, `text-secondary`, `text-muted`):

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background:       '#0a0a09',
        surface:          'rgba(255, 255, 255, 0.02)',
        'surface-border': 'rgba(255, 255, 255, 0.07)',
        accent:           '#c8a96e',
        primary:          '#ffffff',
        secondary:        'rgba(255, 255, 255, 0.45)',
        muted:            'rgba(255, 255, 255, 0.25)',
      },
      fontWeight: {
        light: '300',
      },
      letterSpacing: {
        label: '0.16em',
      },
      fontSize: {
        label: '9px',
      },
    },
  },
  plugins: [],
};

export default config;
```

**`frontend/postcss.config.js`** — `create-next-app` generates this automatically. Verify it contains:

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

**Replace `frontend/next.config.ts`** with:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'labmind-api.up.railway.app',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
      },
    ],
  },
};

export default nextConfig;
```

Note: `remotePatterns` supersedes the deprecated `domains` field shown in `software-architecture.md §11.2` — the intent is identical.

---

## 3. Environment Setup

Create `frontend/.env.local` with this exact content:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

No trailing slash. This variable is read by `lib/api.ts` to prefix all fetch calls and by `ImageComparison.tsx` to construct absolute image URLs.

Create `frontend/.env.local.example` (safe to commit):

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

---

## 4. `globals.css` Content

Replace the scaffolded `src/app/globals.css` entirely with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-background:    #0a0a09;
  --color-surface:       rgba(255, 255, 255, 0.02);
  --color-surface-border:rgba(255, 255, 255, 0.07);
  --color-accent:        #c8a96e;
  --color-text-primary:  #ffffff;
  --color-text-secondary:rgba(255, 255, 255, 0.45);
  --color-text-muted:    rgba(255, 255, 255, 0.25);
}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  height: 100%;
}

body {
  height: 100%;
  background-color: #0a0a09;
  color: #ffffff;
  font-weight: 300;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

::selection {
  background-color: rgba(200, 169, 110, 0.25);
}
```

---

## 5. Build Order

Implement files in this exact sequence. Do not skip ahead — later files import from earlier ones.

---

### Step 1 — `src/lib/types.ts`

Copy the TypeScript interfaces verbatim from `software-architecture.md §9.1`. No logic, no imports.

**Done when:** `npx tsc --noEmit` reports zero errors after this file exists.

---

### Step 2 — `src/lib/api.ts`

Copy the API client verbatim from `software-architecture.md §9.2`.

**Done when:** Opening the browser console and running `fetch('http://localhost:8000/api/status').then(r=>r.json()).then(console.log)` returns a status object (backend must be running).

---

### Step 3 — `src/styles/design-tokens.ts`

Copy the design tokens verbatim from `software-architecture.md §9.15`.

**Done when:** Another file can `import { colors } from '@/styles/design-tokens'` without TypeScript errors.

---

### Step 4 — `src/hooks/usePolling.ts`

Copy the hook verbatim from `software-architecture.md §9.3`.

**Done when:** A temporary `console.log(status)` added to `app/page.tsx` shows the status object printing every ~4 seconds in the browser console, and the Network tab shows `GET /api/status` firing on that interval.

---

### Step 5 — `src/hooks/useChat.ts`

Copy the hook verbatim from `software-architecture.md §9.4`.

**Done when:** TypeScript compiles without errors (`npx tsc --noEmit`).

---

### Step 6 — `src/app/layout.tsx`

```typescript
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({
  subsets: ['latin'],
  weight: ['300', '400'],
});

export const metadata: Metadata = {
  title: 'LabMind',
  description: 'Autonomous experiment optimization',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={geist.className}>{children}</body>
    </html>
  );
}
```

**Done when:** `npm run dev` starts without errors and `localhost:3000` loads with a dark (`#0a0a09`) background.

---

### Step 7 — `src/app/page.tsx`

Copy the root page verbatim from `software-architecture.md §9.5`. The three imports (`WelcomePage`, `RunningView`, `AgentAnalysis`) will cause TypeScript errors until those files exist — this is expected. Create stub files for each to unblock compilation:

```bash
# Stub commands — run from frontend/src/components/
echo "export default function WelcomePage() { return <div>Welcome</div>; }" > WelcomePage.tsx
echo "export default function RunningView({ status }: any) { return <div>Running</div>; }" > RunningView.tsx
echo "export default function AgentAnalysis({ status }: any) { return <div>Analysis</div>; }" > AgentAnalysis.tsx
```

**Done when:** The root page renders one of the three stub components based on the polled `current_state` — confirm by checking the DOM while the backend is in each state.

---

### Step 8 — `src/components/WelcomePage.tsx`

Replace the stub. Full implementation:

```typescript
'use client';
import { api } from '@/lib/api';

export default function WelcomePage() {
  const handleBegin = async () => {
    await api.simulate();
    // No navigation. Root page re-renders on next poll (≤4 s).
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <p className="text-accent text-label tracking-label uppercase mb-6">
        LabMind
      </p>
      <h1 className="text-primary text-4xl font-light text-center mb-4">
        Autonomous experiment optimization
      </h1>
      <p className="text-secondary text-sm font-light text-center max-w-md mb-10">
        AI-guided mRNA-LNP parameter optimization. Each batch is analyzed by a
        LangChain agent that proposes the next experimental conditions.
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
```

**Done when:** Clicking "Begin Experiment Batch" shows `POST /api/simulate` in the Network tab, and within 4 seconds the root page transitions away from `WelcomePage`.

---

### Step 9 — `src/components/StatusPill.tsx`

```typescript
import { SystemState } from '@/lib/types';

const STATE_LABELS: Record<SystemState, string> = {
  IDLE:           'IDLE',
  RUNNING:        'RUNNING',
  COMPLETE:       'COMPLETE',
  ANALYZING:      'ANALYZING',
  PROPOSAL_READY: 'PROPOSAL READY',
  EDITING:        'EDITING',
  REGENERATING:   'REGENERATING',
  APPROVED:       'APPROVED',
};

const ACTIVE_STATES: SystemState[] = ['RUNNING', 'ANALYZING', 'REGENERATING'];

export default function StatusPill({ state }: { state: SystemState }) {
  const isActive = ACTIVE_STATES.includes(state);

  return (
    <div className="inline-flex items-center gap-2 border border-surface-border bg-surface px-3 py-1 rounded-[4px]">
      <span
        className={`w-1.5 h-1.5 rounded-full bg-accent ${isActive ? 'animate-pulse' : ''}`}
      />
      <span className="text-secondary text-label tracking-label uppercase">
        {STATE_LABELS[state]}
      </span>
    </div>
  );
}
```

**Done when:** The pill renders in `AgentAnalysis` with a pulsing dot during `ANALYZING` and a static dot during `PROPOSAL_READY`.

---

### Step 10 — `src/components/RunningView.tsx`

Replace the stub:

```typescript
'use client';
import { api } from '@/lib/api';
import { StatusResponse } from '@/lib/types';
import StatusPill from './StatusPill';

export default function RunningView({ status }: { status: StatusResponse }) {
  const { current_state, current_batch_id } = status;

  const handleSimulate = async () => {
    await api.simulate();
  };

  const isTransitioning = current_state === 'COMPLETE' || current_state === 'APPROVED';

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6">
      <StatusPill state={current_state} />

      <p className="text-secondary text-sm tracking-label uppercase">
        Batch {current_batch_id}
      </p>

      {current_state === 'RUNNING' && (
        <>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
          <button
            onClick={handleSimulate}
            className="border border-surface-border text-secondary px-6 py-2 text-sm tracking-widest uppercase hover:border-accent hover:text-accent transition-colors duration-200"
          >
            Simulate Complete
          </button>
        </>
      )}

      {current_state === 'COMPLETE' && (
        <p className="text-secondary text-sm animate-pulse">Preparing analysis…</p>
      )}

      {current_state === 'APPROVED' && (
        <p className="text-secondary text-sm animate-pulse">Writing batch data…</p>
      )}
    </div>
  );
}
```

**Done when:** In `RUNNING` state the pulsing dots and "Simulate Complete" button are visible. Clicking the button triggers `POST /api/simulate` in the Network tab.

---

### Step 11 — `src/components/AgentAnalysis.tsx`

Replace the stub. This is the shell — it imports child components in order:

```typescript
'use client';
import { StatusResponse } from '@/lib/types';
import StatusPill from './StatusPill';
import MetricCards from './MetricCards';
import ImageComparison from './ImageComparison';
import AnalysisText from './AnalysisText';
import ParameterChips from './ParameterChips';
import ChatInterface from './ChatInterface';
import ActionRow from './ActionRow';

export default function AgentAnalysis({ status }: { status: StatusResponse }) {
  const { current_state, current_batch_id, pending_proposal_id } = status;

  return (
    <div className="min-h-screen bg-background px-8 py-10 max-w-5xl mx-auto">
      <div className="mb-6">
        <StatusPill state={current_state} />
      </div>

      <p className="text-secondary text-label tracking-label uppercase mb-8">
        Batch {current_batch_id}
        {pending_proposal_id ? ` → ${pending_proposal_id} Proposal` : ''}
      </p>

      <MetricCards status={status} />

      <div className="mt-8">
        <ImageComparison imageUrls={status.image_urls} />
      </div>

      <div className="mt-8">
        <AnalysisText
          text={status.latest_analysis}
          isLoading={current_state === 'ANALYZING'}
        />
      </div>

      <div className="mt-8">
        <ParameterChips
          batchId={current_batch_id}
          proposalSummary={status.proposal_summary}
        />
      </div>

      <hr className="my-8 border-surface-border" />

      <ChatInterface
        history={status.chat_history}
        disabled={current_state === 'ANALYZING' || current_state === 'REGENERATING'}
      />

      <div className="mt-6">
        <ActionRow status={status} />
      </div>
    </div>
  );
}
```

Create stubs for the child components that don't exist yet (same technique as Step 7) so the dev server stays green while you implement them one by one.

**Done when:** `AgentAnalysis` renders without runtime errors in any analysis state.

---

### Step 12 — `src/components/MetricCards.tsx`

```typescript
'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatusResponse, BatchSummary } from '@/lib/types';

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-surface-border bg-surface rounded-[4px] p-5 flex flex-col gap-2">
      <p className="text-secondary text-label tracking-label uppercase">{label}</p>
      <p className="text-primary text-3xl font-light">{value}</p>
    </div>
  );
}

export default function MetricCards({ status }: { status: StatusResponse }) {
  const [summaries, setSummaries] = useState<BatchSummary[]>([]);

  useEffect(() => {
    api.getAllBatches().then(setSummaries).catch(() => {});
  }, []);

  const current = summaries.find((s) => s.batch_id === status.current_batch_id);
  const currentIndex = summaries.findIndex((s) => s.batch_id === status.current_batch_id);
  const previous = currentIndex > 0 ? summaries[currentIndex - 1] : null;

  const totalExperiments = current?.experiment_count ?? '—';
  const bestRate = current?.best_transfection_rate != null
    ? `${Math.round(current.best_transfection_rate * 100)}%`
    : '—';
  const awaiting = status.pending_proposal_id ? '1 batch' : '—';

  let convergence = '—';
  if (
    current?.best_transfection_rate != null &&
    previous?.best_transfection_rate != null &&
    previous.best_transfection_rate > 0
  ) {
    const pct =
      ((current.best_transfection_rate - previous.best_transfection_rate) /
        previous.best_transfection_rate) *
      100;
    convergence = `${pct > 0 ? '+' : ''}${Math.round(pct)}%`;
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      <Card label="Total Experiments" value={String(totalExperiments)} />
      <Card label="Best Transfection" value={bestRate} />
      <Card label="Awaiting Approval" value={awaiting} />
      <Card label="Convergence" value={convergence} />
    </div>
  );
}
```

**Done when:** All 4 cards render with data. Convergence shows `"—"` when only one batch exists and a `"+NN%"` value when two or more batches are present.

---

### Step 13 — `src/components/ImageComparison.tsx`

```typescript
import Image from 'next/image';
import { ImageUrls } from '@/lib/types';

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

function Frame({
  src,
  label,
  labelColor,
}: {
  src: string | null;
  label: string;
  labelColor: string;
}) {
  return (
    <div className="flex-1 border border-surface-border bg-surface rounded-[4px] overflow-hidden">
      <div className="relative w-full aspect-video bg-[#111110]">
        {src ? (
          <Image
            src={`${BASE}${src}`}
            alt={label}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-muted text-sm animate-pulse">Analyzing…</p>
          </div>
        )}
      </div>
      <div className="px-4 py-2">
        <p
          className="text-label tracking-label uppercase"
          style={{ color: labelColor }}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

export default function ImageComparison({
  imageUrls,
}: {
  imageUrls: ImageUrls | null;
}) {
  return (
    <div className="flex gap-4">
      <Frame
        src={imageUrls?.optimal ?? null}
        label="Optimal Condition"
        labelColor="#c8a96e"
      />
      <Frame
        src={imageUrls?.baseline ?? null}
        label="Baseline"
        labelColor="rgba(255,255,255,0.45)"
      />
    </div>
  );
}
```

**Done when:** During `ANALYZING`, both frames show the "Analyzing…" placeholder. After `PROPOSAL_READY`, both frames show the fluorescence images loaded from the backend URL.

---

### Step 14 — `src/components/AnalysisText.tsx`

```typescript
export default function AnalysisText({
  text,
  isLoading,
}: {
  text: string | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[100, 90, 75].map((w) => (
          <div
            key={w}
            className="h-3 bg-surface-border rounded animate-pulse"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    );
  }

  if (!text) return null;

  return (
    <p className="text-secondary text-sm font-light leading-relaxed">{text}</p>
  );
}
```

**Done when:** During `ANALYZING`, three pulsing skeleton bars are visible. After `PROPOSAL_READY`, the Claude-generated analysis prose replaces them.

---

### Step 15 — `src/components/ParameterChips.tsx`

```typescript
'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Experiment, ProposalSummary } from '@/lib/types';

function Chip({
  label,
  value,
  gold,
}: {
  label: string;
  value: string;
  gold?: boolean;
}) {
  return (
    <div
      className="border rounded-[4px] px-3 py-1.5 flex flex-col gap-0.5"
      style={{
        borderColor: gold ? 'rgba(200,169,110,0.4)' : 'rgba(255,255,255,0.07)',
        backgroundColor: gold ? 'rgba(200,169,110,0.05)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <p className="text-label tracking-label uppercase" style={{ color: 'rgba(255,255,255,0.25)' }}>
        {label}
      </p>
      <p className="text-sm font-light" style={{ color: gold ? '#c8a96e' : '#ffffff' }}>
        {value}
      </p>
    </div>
  );
}

export default function ParameterChips({
  batchId,
  proposalSummary,
}: {
  batchId: string | null;
  proposalSummary: ProposalSummary | null;
}) {
  const [topPerformer, setTopPerformer] = useState<Experiment | null>(null);

  useEffect(() => {
    if (!batchId) return;
    api.getBatch(batchId).then((batch) => {
      const top = batch.experiments.find((e) => e.is_top_performer);
      if (top) setTopPerformer(top);
    }).catch(() => {});
  }, [batchId]);

  return (
    <div className="space-y-4">
      {topPerformer && (
        <div>
          <p className="text-label tracking-label uppercase text-muted mb-2">
            Current Top Performer
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip gold label="pH" value={topPerformer.parameters.pH.toFixed(2)} />
            <Chip gold label="Temp" value={`${topPerformer.parameters.temperature_c}°C`} />
            <Chip gold label="Conc" value={`${topPerformer.parameters.concentration_mg_ml.toFixed(3)} mg/mL`} />
            <Chip gold label="Lipid" value={topPerformer.parameters.lipid_ratio} />
            <Chip gold label="Hours" value={`${topPerformer.parameters.incubation_hours}h`} />
          </div>
        </div>
      )}

      {proposalSummary && (
        <div>
          <p className="text-label tracking-label uppercase text-muted mb-2">
            Proposed Range ({proposalSummary.experiment_count} experiments)
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip label="pH" value={`${proposalSummary.param_ranges.pH.min}–${proposalSummary.param_ranges.pH.max}`} />
            <Chip label="Temp" value={`${proposalSummary.param_ranges.temperature_c.min}–${proposalSummary.param_ranges.temperature_c.max}°C`} />
            <Chip label="Conc" value={`${proposalSummary.param_ranges.concentration_mg_ml.min}–${proposalSummary.param_ranges.concentration_mg_ml.max} mg/mL`} />
            <Chip label="Lipid" value={proposalSummary.param_ranges.lipid_ratio} />
            <Chip label="Hours" value={`${proposalSummary.param_ranges.incubation_hours.min}–${proposalSummary.param_ranges.incubation_hours.max}h`} />
          </div>
        </div>
      )}
    </div>
  );
}
```

**Done when:** Gold chips show the top performer's exact values; muted chips show the proposal range. During `ANALYZING` (when `proposalSummary` is null), only the top performer row renders — if batch data hasn't loaded yet, nothing renders (no error).

---

### Step 16 — `src/components/ChatInterface.tsx`

```typescript
'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { ChatMessage } from '@/lib/types';

export default function ChatInterface({
  history,
  disabled,
}: {
  history: ChatMessage[];
  disabled: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(history);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading || disabled) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);
    try {
      const res = await api.chat(text);
      setMessages((prev) => [...prev, { role: 'agent', content: res.response }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border border-surface-border rounded-[4px] overflow-hidden">
      <div
        className="overflow-y-auto px-4 py-4 space-y-3"
        style={{ maxHeight: '320px' }}
      >
        {messages.length === 0 && (
          <p className="text-muted text-sm text-center py-6">
            Ask the agent about the analysis or add constraints…
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-3 py-2 rounded-[4px] text-sm font-light ${
                msg.role === 'user'
                  ? 'bg-surface text-primary'
                  : 'border-l-2 bg-surface text-secondary'
              }`}
              style={msg.role === 'agent' ? { borderColor: '#c8a96e' } : {}}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="border-l-2 bg-surface px-3 py-2 rounded-[4px]" style={{ borderColor: '#c8a96e' }}>
              <span className="text-muted text-sm animate-pulse">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-surface-border flex">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={disabled || isLoading}
          placeholder={disabled ? 'Chat unavailable during analysis…' : 'Message the agent…'}
          className="flex-1 bg-transparent px-4 py-3 text-sm text-primary placeholder-muted outline-none disabled:opacity-40"
        />
        <button
          onClick={send}
          disabled={disabled || isLoading || !input.trim()}
          className="px-4 py-3 text-accent text-sm tracking-widest uppercase hover:bg-surface disabled:opacity-30 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

**Done when:** Sending a message shows the user bubble immediately, then the agent reply appears below it. The container scrolls to the bottom automatically. Input and Send are greyed out during `ANALYZING` and `REGENERATING`.

---

### Step 17 — `src/components/ActionRow.tsx`

```typescript
'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { StatusResponse } from '@/lib/types';

export default function ActionRow({ status }: { status: StatusResponse }) {
  const { current_state, pending_proposal_id, latest_constraints } = status;
  const [approvePending, setApprovePending] = useState(false);
  const [regenPending, setRegenPending] = useState(false);

  // Clear local pending flags when state confirms the transition completed
  useEffect(() => {
    if (current_state !== 'APPROVED') setApprovePending(false);
    if (current_state !== 'REGENERATING') setRegenPending(false);
  }, [current_state]);

  const handleApprove = async () => {
    setApprovePending(true);
    await api.approve().catch(() => setApprovePending(false));
  };

  const handleRegenerate = async () => {
    setRegenPending(true);
    await api.regenerate().catch(() => setRegenPending(false));
  };

  const approveEnabled = current_state === 'PROPOSAL_READY' && !approvePending;
  const regenEnabled =
    (current_state === 'PROPOSAL_READY' || current_state === 'EDITING') &&
    !!latest_constraints &&
    !regenPending;

  return (
    <div className="flex gap-3">
      <button
        onClick={handleApprove}
        disabled={!approveEnabled}
        className="flex items-center gap-2 border px-6 py-2.5 text-sm tracking-widest uppercase transition-colors disabled:opacity-30"
        style={{
          borderColor: approveEnabled ? '#c8a96e' : 'rgba(255,255,255,0.07)',
          color: approveEnabled ? '#c8a96e' : 'rgba(255,255,255,0.25)',
        }}
      >
        {approvePending && <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />}
        Approve Batch {pending_proposal_id}
      </button>

      <button
        onClick={handleRegenerate}
        disabled={!regenEnabled}
        className="flex items-center gap-2 border border-surface-border text-secondary px-6 py-2.5 text-sm tracking-widest uppercase hover:border-accent hover:text-accent transition-colors disabled:opacity-30"
      >
        {regenPending && <span className="w-3 h-3 border border-secondary border-t-transparent rounded-full animate-spin" />}
        Regenerate Proposal
      </button>
    </div>
  );
}
```

**Done when:** "Approve Batch" has a gold border and is clickable only in `PROPOSAL_READY`. "Regenerate Proposal" is enabled in `PROPOSAL_READY` and `EDITING` only when `latest_constraints` is non-null. Clicking either button shows a spinner inside the button immediately.

---

### Step 18 — `src/components/BatchHistoryPage.tsx` + `src/app/history/page.tsx`

Create `src/app/history/page.tsx`:

```typescript
import BatchHistoryPage from '@/components/BatchHistoryPage';

export default function HistoryPage() {
  return <BatchHistoryPage />;
}
```

Create `src/components/BatchHistoryPage.tsx`:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BatchSummary, BatchResponse } from '@/lib/types';

function rateToColor(rate: number): string {
  // Linear interpolation: 0.0 → #1a1a1a (rgb 26,26,26), 1.0 → #ffffff (rgb 255,255,255)
  const v = Math.round(26 + (255 - 26) * rate);
  return `rgb(${v}, ${v}, ${v})`;
}

function rateToTextColor(rate: number): string {
  return rate > 0.55 ? '#0a0a09' : 'rgba(255,255,255,0.6)';
}

function TrendLine({ summaries }: { summaries: BatchSummary[] }) {
  const w = 300;
  const h = 80;
  const pad = 8;
  const data = summaries
    .filter((s) => s.best_transfection_rate != null)
    .map((s) => s.best_transfection_rate as number);

  if (data.length < 2) return null;

  const xStep = (w - pad * 2) / (data.length - 1);
  const points = data
    .map((rate, i) => {
      const x = pad + i * xStep;
      const y = pad + (1 - rate) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} className="block">
      <polyline
        points={points}
        fill="none"
        stroke="#c8a96e"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {data.map((rate, i) => (
        <circle
          key={i}
          cx={pad + i * xStep}
          cy={pad + (1 - rate) * (h - pad * 2)}
          r="2.5"
          fill="#c8a96e"
        />
      ))}
    </svg>
  );
}

export default function BatchHistoryPage() {
  const [summaries, setSummaries] = useState<BatchSummary[]>([]);
  const [batches, setBatches] = useState<BatchResponse[]>([]);

  useEffect(() => {
    api.getAllBatches().then((sums) => {
      setSummaries(sums);
      const complete = sums.filter((s) => s.status === 'complete');
      Promise.all(complete.map((s) => api.getBatch(s.batch_id))).then(setBatches);
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background px-8 py-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <p className="text-label tracking-label uppercase text-secondary">
          Experiment History
        </p>
        <TrendLine summaries={summaries} />
      </div>

      <div className="space-y-8">
        {batches.map((batch) => {
          const top = batch.experiments.find((e) => e.is_top_performer);
          return (
            <div key={batch.batch_id} className="border border-surface-border rounded-[4px] p-6">
              <div className="flex items-baseline gap-3 mb-4">
                <p className="text-accent text-label tracking-label uppercase">
                  Batch {batch.batch_id}
                </p>
                <p className="text-muted text-xs">{batch.description}</p>
              </div>

              <div className="flex gap-0.5 mb-4">
                {batch.experiments.map((exp) => {
                  const rate = exp.transfection_rate ?? 0;
                  return (
                    <div
                      key={exp.exp_id}
                      title={`${exp.exp_id}: ${(rate * 100).toFixed(0)}%`}
                      className="flex-1 h-8 rounded-sm flex items-center justify-center text-[8px] font-medium"
                      style={{
                        backgroundColor: rateToColor(rate),
                        color: rateToTextColor(rate),
                      }}
                    >
                      {(rate * 100).toFixed(0)}
                    </div>
                  );
                })}
              </div>

              {top && (
                <div className="flex gap-3 flex-wrap">
                  <p className="text-muted text-xs">Top performer:</p>
                  {Object.entries(top.parameters).map(([k, v]) => (
                    <span key={k} className="text-accent text-xs">
                      {k.replace(/_/g, ' ')} {v}
                    </span>
                  ))}
                  <span className="text-secondary text-xs ml-auto">
                    {top.transfection_rate != null
                      ? `${(top.transfection_rate * 100).toFixed(0)}% transfection`
                      : ''}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Done when:** Navigating to `/history` shows one card per batch, each with 20 colored cells (dark cells = low rate, light cells = high rate) and a gold SVG trend line in the header showing improvement across batches.

---

### Step 19 — `src/components/ExperimentsTable.tsx` + `src/app/experiments/page.tsx`

Create `src/app/experiments/page.tsx`:

```typescript
import ExperimentsTable from '@/components/ExperimentsTable';

export default function ExperimentsPage() {
  return <ExperimentsTable />;
}
```

Create `src/components/ExperimentsTable.tsx`:

```typescript
'use client';
import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { Experiment, BatchSummary } from '@/lib/types';

type SortKey = 'transfection_rate' | 'cell_viability' | 'exp_id' | 'pH' | 'temperature_c' | 'concentration_mg_ml' | 'incubation_hours';
type SortDir = 'asc' | 'desc';

interface FlatExperiment extends Experiment {
  batch_id: string;
}

function getValue(exp: FlatExperiment, key: SortKey): number | string {
  if (key === 'exp_id') return exp.exp_id;
  if (key === 'transfection_rate') return exp.transfection_rate ?? -1;
  if (key === 'cell_viability') return exp.cell_viability ?? -1;
  return exp.parameters[key as keyof typeof exp.parameters] as number;
}

export default function ExperimentsTable() {
  const [allExperiments, setAllExperiments] = useState<FlatExperiment[]>([]);
  const [summaries, setSummaries] = useState<BatchSummary[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('transfection_rate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterBatch, setFilterBatch] = useState<string | null>(null);

  useEffect(() => {
    api.getAllBatches().then((sums) => {
      setSummaries(sums);
      const complete = sums.filter((s) => s.status === 'complete');
      Promise.all(complete.map((s) => api.getBatch(s.batch_id))).then((batches) => {
        const flat: FlatExperiment[] = batches.flatMap((b) =>
          b.experiments.map((e) => ({ ...e, batch_id: b.batch_id }))
        );
        setAllExperiments(flat);
      });
    }).catch(() => {});
  }, []);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const displayed = useMemo(() => {
    const filtered = filterBatch
      ? allExperiments.filter((e) => e.batch_id === filterBatch)
      : allExperiments;

    return [...filtered].sort((a, b) => {
      const av = getValue(a, sortKey);
      const bv = getValue(b, sortKey);
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc'
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }, [allExperiments, filterBatch, sortKey, sortDir]);

  const cols: { key: SortKey; label: string }[] = [
    { key: 'exp_id', label: 'Exp ID' },
    { key: 'pH', label: 'pH' },
    { key: 'temperature_c', label: 'Temp °C' },
    { key: 'concentration_mg_ml', label: 'Conc mg/mL' },
    { key: 'incubation_hours', label: 'Hours' },
    { key: 'transfection_rate', label: 'Transfection' },
    { key: 'cell_viability', label: 'Viability' },
  ];

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';

  return (
    <div className="min-h-screen bg-background px-8 py-10 max-w-6xl mx-auto">
      <p className="text-label tracking-label uppercase text-secondary mb-6">
        Experiments
      </p>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilterBatch(null)}
          className={`text-xs px-3 py-1 border rounded-[4px] transition-colors ${
            filterBatch === null
              ? 'border-accent text-accent'
              : 'border-surface-border text-muted hover:border-secondary'
          }`}
        >
          All
        </button>
        {summaries.map((s) => (
          <button
            key={s.batch_id}
            onClick={() => setFilterBatch(s.batch_id)}
            className={`text-xs px-3 py-1 border rounded-[4px] transition-colors ${
              filterBatch === s.batch_id
                ? 'border-accent text-accent'
                : 'border-surface-border text-muted hover:border-secondary'
            }`}
          >
            {s.batch_id}
          </button>
        ))}
      </div>

      <div className="border border-surface-border rounded-[4px] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="text-left px-3 py-2 text-muted text-label tracking-label uppercase">
                Batch
              </th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => handleSort(c.key)}
                  className="text-left px-3 py-2 text-muted text-label tracking-label uppercase cursor-pointer hover:text-secondary select-none"
                >
                  {c.label}{arrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((exp) => {
              const rate = exp.transfection_rate ?? 0;
              return (
                <tr
                  key={exp.exp_id}
                  className="border-b border-surface-border hover:bg-surface transition-colors"
                  style={
                    exp.is_top_performer
                      ? { borderLeft: '2px solid #c8a96e' }
                      : {}
                  }
                >
                  <td className="px-3 py-2 text-muted">{exp.batch_id}</td>
                  <td className="px-3 py-2 text-secondary">{exp.exp_id}</td>
                  <td className="px-3 py-2 text-secondary">{exp.parameters.pH}</td>
                  <td className="px-3 py-2 text-secondary">{exp.parameters.temperature_c}</td>
                  <td className="px-3 py-2 text-secondary">{exp.parameters.concentration_mg_ml}</td>
                  <td className="px-3 py-2 text-secondary">{exp.parameters.incubation_hours}</td>
                  <td className="px-3 py-2">
                    <div className="relative h-5 rounded-sm overflow-hidden bg-surface min-w-[80px]">
                      <div
                        className="absolute inset-y-0 left-0 bg-accent opacity-20"
                        style={{ width: `${rate * 100}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-1.5 text-primary text-xs">
                        {exp.transfection_rate != null
                          ? `${(rate * 100).toFixed(0)}%`
                          : '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-secondary">
                    {exp.cell_viability != null
                      ? `${(exp.cell_viability * 100).toFixed(0)}%`
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Done when:** Navigating to `/experiments` shows all experiments in a sortable table. Clicking column headers cycles sort direction. The top-performer row in each batch has a gold left border. The `transfection_rate` column shows a partial gold bar behind the percentage.

---

## 6. Component Implementation Notes

One non-obvious implementation detail per component:

### `WelcomePage.tsx`
Do not add a loading state to the "Begin Experiment Batch" button. `api.simulate()` returns immediately with `{"status": "started"}` — the actual state transition happens in the background. The page re-routes on the next polling cycle (≤4 s). Adding a spinner creates false feedback since the button's job is done the moment the POST resolves.

### `RunningView.tsx`
The `APPROVED` state routes to `RunningView` (it's in `RUNNING_STATES`). The component must render a "Writing batch data…" message for this case because `APPROVED` is a transient state (~1 poll duration) before the background task flips it to `RUNNING`. If `APPROVED` is not handled, the user sees a blank or broken view for one polling cycle.

### `AgentAnalysis.tsx`
Guard the eyebrow label against `null`. During early `ANALYZING`, `pending_proposal_id` is null (the agent hasn't produced a proposal ID yet). Render `"BATCH {current_batch_id}"` without the arrow segment when `pending_proposal_id` is null — do not concatenate `"→ null PROPOSAL"`.

### `StatusPill.tsx`
The `COMPLETE` state is transient (the backend transitions COMPLETE → ANALYZING immediately inside `run_agent_loop`). In practice, the frontend may never poll during this window, but the pill must handle it. Map it to label `"COMPLETE"` with a static dot — same pattern as `APPROVED`.

### `MetricCards.tsx`
The convergence percentage requires the **previous** batch's `best_transfection_rate`, not just the current one. Call `GET /api/batches` on mount (not `GET /api/batch/{id}`). The `BatchSummary` type already includes `best_transfection_rate`. Sort the summary list by batch numeric ID to correctly identify current (`summaries[currentIndex]`) and previous (`summaries[currentIndex - 1]`). When `currentIndex === 0` (only one batch exists), display `"—"`.

### `ImageComparison.tsx`
The `src` prop passed to Next.js `<Image>` must be an absolute URL: `${process.env.NEXT_PUBLIC_BACKEND_URL}${imageUrls.optimal}`. The backend returns image paths as relative strings (`"/static/images/positive_1.png"`). Next.js image optimization requires the host to be listed in `next.config.ts` `remotePatterns` — missing this causes a `400` error from `/_next/image`. If `imageUrls` is null (during `ANALYZING`), render placeholder `<div>` boxes of the same `aspect-video` dimensions to prevent layout shift when images load.

### `AnalysisText.tsx`
The loading skeleton must have **three bars of descending width** (`100%`, `90%`, `75%`) to suggest a multi-line paragraph — a single bar looks like a title loader, not body text. Use `animate-pulse` on each bar. Transition to prose by simply rendering `<p>{text}</p>` once `isLoading` is false and `text` is non-null. No fade animation is needed — the state flip from `ANALYZING` to `PROPOSAL_READY` is already a significant visual event.

### `ParameterChips.tsx`
`GET /api/batch/{batchId}` is called on mount inside `ParameterChips` and also inside `MetricCards`. This results in two parallel fetches of the same resource. This duplication is intentional for component encapsulation at MVP scale. Do not add a shared context or cache — the response is tiny (20 experiments) and fetched once per page load.

### `ChatInterface.tsx`
Auto-scroll is triggered by `useEffect` on `messages.length` (not `messages` itself) because object reference equality would trigger on every re-render. Call `bottomRef.current?.scrollIntoView({ behavior: 'smooth' })` where `bottomRef` is attached to an empty `<div>` at the end of the message list. The `messages` state is initialized from the `history` prop via `useState(history)` — subsequent polling updates to `history` do **not** re-initialize local state (this is intentional per the architecture). Server-side chat history and local state stay in sync because the agent replies are fast enough to appear before the next poll.

### `ActionRow.tsx`
The local `approvePending` / `regenPending` boolean is cleared by a `useEffect` watching `current_state`. This avoids a stuck spinner: if the POST succeeds but the next poll is delayed, the button still shows the spinner until polling confirms the state change. Clear `approvePending` when `current_state !== 'APPROVED'`; clear `regenPending` when `current_state !== 'REGENERATING'`. Do not clear on POST resolve — the POST returns `{"status": "approved"}` immediately, before the background task has run.

### `BatchHistoryPage.tsx`
Cell color formula — linear interpolation between `#1a1a1a` (rate 0.0) and `#ffffff` (rate 1.0):

```typescript
function rateToColor(rate: number): string {
  const v = Math.round(26 + (255 - 26) * Math.max(0, Math.min(1, rate)));
  return `rgb(${v}, ${v}, ${v})`;
}
```

`26` is `0x1a`. Text on the cell: use `#0a0a09` (dark) when `rate > 0.55`, else `rgba(255,255,255,0.6)` (light). The SVG `<polyline>` trend line: normalize Y as `pad + (1 - rate) * (height - pad * 2)` so that higher rates are visually higher on the chart. Include `<circle>` dots at each data point so individual batch positions are readable even with only 2 batches.

### `ExperimentsTable.tsx`
Client-side sort without a library: use `[...experiments].sort((a, b) => ...)` — always spread into a new array before sorting to avoid mutating state. The sort comparator branches on type: numeric keys use subtraction, string keys use `localeCompare`. Toggle direction: same key clicked → flip `sortDir`; new key clicked → set `sortDir` to `'desc'` (descending is the natural default for scientific metrics). The `transfection_rate` progress bar: wrap a `<div style={{ width: rate * 100 + '%' }}>` inside a `position: relative` parent — keep it behind the number text using `position: absolute` with `opacity: 0.2` on the bar.

---

## 7. Polling Behavior Spec

### Initial load (status is `null`)

While `status` is `null` (before the first `GET /api/status` response returns), `app/page.tsx` evaluates `!status` as `true` and renders `<WelcomePage />`. This is the correct fallback — the welcome page appears for at most one polling interval (~0–4 s) before the real state resolves. Do not add a separate loading spinner in `page.tsx`; the welcome page itself is a neutral starting state.

### Fetch error during polling

The `try/catch` in `usePolling.ts` swallows errors silently — no `setStatus` call is made, so the UI keeps the last known `StatusResponse`. The `setInterval` is not cleared on error; the next tick fires as normal. This means:
- If the backend is temporarily unreachable, the UI freezes at its last known state. This is correct for a demo.
- If the very first poll fails, `status` remains `null` and `WelcomePage` stays rendered. The next poll attempt fires in 4 seconds.
- Do not add toast notifications or error banners for polling failures — they would create noise during backend restarts.

### Avoiding stale closures in `setInterval`

The `fetchStatus` function is defined inside `useEffect` and re-created only when `intervalMs` changes (which it never does — it's always `4000`). The function calls `setStatus(data)` using the stable setter from `useState` — React guarantees this reference never changes. The function calls `api.getStatus()` which is a module-level reference that also never changes. There are no stale closures.

The `intervalRef` pattern (`useRef<ReturnType<typeof setInterval>>`) stores the interval ID in a ref rather than a state variable. The cleanup function `() => clearInterval(intervalRef.current)` reads from `.current` at cleanup time (when the effect tears down), not at the time the closure was created. This correctly cancels the interval on unmount.

**Do not** write the polling like this — it creates a stale closure over `status`:

```typescript
// WRONG — stale closure over `status`
useEffect(() => {
  const id = setInterval(() => {
    if (status) { /* status is stale here */ }
  }, 4000);
  return () => clearInterval(id);
}, []); // status not in deps
```

**Do** use the pattern from the architecture (§9.3): define `fetchStatus` inside the effect so it captures nothing from outer scope except the stable `setStatus` setter.

---

## 8. State-Driven Render Table

| `current_state` | Top-level component | Enabled buttons | Loading elements | Status pill label |
|---|---|---|---|---|
| `IDLE` | `WelcomePage` | "Begin Experiment Batch" | none | (pill not shown) |
| `RUNNING` | `RunningView` | "Simulate Complete" | pulsing dot animation | `RUNNING` |
| `COMPLETE` | `RunningView` | none | "Preparing analysis…" pulse | `COMPLETE` |
| `APPROVED` | `RunningView` | none | "Writing batch data…" pulse | `APPROVED` |
| `ANALYZING` | `AgentAnalysis` | none | `AnalysisText` skeleton bars; `ImageComparison` placeholder boxes; chat input disabled | `ANALYZING` |
| `PROPOSAL_READY` | `AgentAnalysis` | "Approve Batch {id}"; "Regenerate Proposal" (only if `latest_constraints` non-null) | none | `PROPOSAL READY` |
| `EDITING` | `AgentAnalysis` | "Regenerate Proposal" only; "Approve Batch" disabled | none | `EDITING` |
| `REGENERATING` | `AgentAnalysis` | none | spinner in "Regenerate Proposal" button; chat input disabled | `REGENERATING` |

Additional button logic not captured by state alone:
- "Regenerate Proposal" is **always disabled** when `latest_constraints` is `null`, regardless of state. This guards against calling `POST /api/regenerate` when the backend would 409.
- "Approve Batch" shows the `pending_proposal_id` in its label. If that is `null` (should not happen in `PROPOSAL_READY`), fall back to "Approve Batch".

---

## 9. Next.js + Vercel Deploy Checklist

Execute in this order:

1. **Confirm `next.config.ts` has the Railway domain** in `remotePatterns` (Section 2 above). If the Railway URL differs from `labmind-api.up.railway.app`, update accordingly before deploying.

2. **Run a local production build** to catch TypeScript and ESLint errors before pushing:
   ```bash
   cd frontend
   npm run build
   # Must exit 0 with no errors
   ```

3. **Push the repo to GitHub.** Vercel deploys from git.

4. **Import the project into Vercel:**
   - Go to vercel.com → "Add New Project" → import the GitHub repo
   - Set **Root Directory** to `frontend`
   - Framework preset: **Next.js** (auto-detected)
   - Build command: `npm run build` (default)
   - Output directory: `.next` (default)

5. **Set the environment variable in Vercel dashboard:**
   - Project → Settings → Environment Variables
   - Add: `NEXT_PUBLIC_BACKEND_URL` = `https://labmind-api.up.railway.app`
   - Scope: Production (and Preview if needed)
   - **Do not** set a trailing slash.

6. **Trigger a deployment** (Vercel auto-deploys on push, or use "Redeploy" in the dashboard).

7. **Verify images load** — navigate to a state where `ImageComparison` renders (e.g., `PROPOSAL_READY`). Open DevTools → Network → filter by `image`. Confirm requests go to `labmind-api.up.railway.app/static/images/…` and return `200`. A `400` from `/_next/image` means the domain is missing from `remotePatterns`.

8. **Verify polling works in production** — open DevTools → Network → filter by `Fetch/XHR`. Confirm `GET /api/status` fires every 4 seconds and returns the correct JSON. A CORS error means the backend's `FRONTEND_URL` env var on Railway does not match the Vercel deployment URL.

---

## 10. Known Gotchas

1. **`'use client'` on every component using hooks.** Next.js App Router treats all files in `src/app/` and `src/components/` as Server Components by default. Any file using `useState`, `useEffect`, `useRef`, or custom hooks must have `'use client'` as its very first line. Missing this causes a cryptic error: *"You're importing a component that needs `useState`. It only works in a Client Component…"*

2. **`NEXT_PUBLIC_` prefix is mandatory for browser-accessible env vars.** The `NEXT_PUBLIC_BACKEND_URL` variable is read in `lib/api.ts` and `ImageComparison.tsx` — both run in the browser. Any env var without the `NEXT_PUBLIC_` prefix is `undefined` in the browser bundle. Server-side env vars (read in API routes or Server Components) do not need this prefix, but no such pattern exists in this codebase.

3. **Image `src` must be an absolute URL.** Next.js `<Image>` with an external `src` requires the full URL including protocol and hostname. The backend returns paths like `"/static/images/positive_1.png"`. Prepend `process.env.NEXT_PUBLIC_BACKEND_URL`: `${BASE}${imageUrls.optimal}`. Using a relative path causes a next/image `hostname` error.

4. **`remotePatterns` instead of `domains`.** The `domains` field in `next.config.ts` is deprecated since Next.js 13 and removed in Next.js 15. Use `remotePatterns` as shown in Section 2. The architecture doc shows `domains` — override it with the `remotePatterns` config in Section 2.

5. **`setInterval` cleanup is required.** The `useEffect` in `usePolling.ts` must return a cleanup function that calls `clearInterval`. Without it, the interval continues firing after the component unmounts (e.g., during hot reload in dev), causing memory leaks and duplicate network requests. The `useRef` pattern in the architecture handles this correctly.

6. **`useState(initialHistory)` does not re-initialize on prop change.** In `ChatInterface`, the `messages` state is initialized from the `history` prop exactly once. If the parent's `history` prop updates (from a polling cycle), the local `messages` state does not reset. This is intentional — it prevents local optimistic messages from being wiped on each poll. The trade-off: messages from other browser sessions will not appear without a page refresh. Acceptable for single-user MVP.

7. **`page.tsx` in `app/history/` and `app/experiments/` cannot use hooks directly** without `'use client'`. These pages import `BatchHistoryPage` and `ExperimentsTable` which are already marked `'use client'`. The page files themselves can remain Server Components (no `'use client'` needed) as long as they only render a single client component child. This is the correct pattern.

8. **Polling continues on all pages, not just the root page.** `usePolling` is only called in `src/app/page.tsx`. Navigating to `/history` or `/experiments` stops the root page from polling. This is correct behavior — those pages are static views that fetch on mount, not live dashboards.

9. **`lipid_ratio` in `param_ranges` is a string, not a `{min, max}` object.** The `ParamRanges` interface has `lipid_ratio: string` (the most common value), while all other keys are `{min: number; max: number}`. The `ParameterChips` component renders it directly as a string chip without range formatting.

10. **Backend static file URL is different in development vs production.** In dev, images are served from `http://localhost:8000/static/images/…`. In production, from `https://labmind-api.up.railway.app/static/images/…`. The `NEXT_PUBLIC_BACKEND_URL` env var handles this transparently — do not hardcode either URL anywhere in component code.

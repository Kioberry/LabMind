# LabMind Frontend Modification Plan v2

**Date:** 2026-05-07
**Status:** Approved — ready for implementation in new chat
**Scope:** UX overhaul — state lifecycle, navigation, chat layout, log readability, Analysis page

---

## 1. Confirmed Complete User Flow

```
[Server starts up]
    → Auto-reset state to IDLE (clear state.json, delete processed images)
    → Preserve B1, B2 batch JSON files (historical data, untouched)

[User opens app — IDLE state]
    → WelcomePage: platform intro + "Begin Experiment Batch" button
    → No sidebar on this screen (full-screen welcome)

[Click "Begin Experiment Batch" → RUNNING]
    → Sidebar appears (Home / History / Analysis / Reset Demo)
    → Main area: RunningView
    → Descriptive text: "Batch B3 experiments are running in the lab..."
    → Button: "Run Analysis" (click → immediately disabled + spinner)

[Click "Run Analysis" → PROCESSING → ANALYZING]
    → Main area: 4 metric cards + live scrolling log below
    → Log format: detailed per-experiment output (see Section 2, Issue 7)
    → Pinned bottom: compact chat input (disabled, placeholder "Analysis in progress…")

[PROPOSAL_READY]
    → Main area: metric cards + image comparison + AI analysis text + parameter chips
    → Pinned bottom: compact chat input (enabled)
    → "Approve Batch B4" button (active) + "Regenerate Proposal" (inactive unless constraint given)

[Researcher sends a message — chat behavior depends on content]
    → Question / general chat: state stays PROPOSAL_READY, agent replies
    → Constraint message (e.g. "keep pH below 7.0"): state → EDITING
        - StatusPill shows "EDITING"
        - Constraint saved in backend (latest_constraints)
        - "Regenerate Proposal" button activates (gold border highlight)
        - Agent confirms constraint in reply

[Click "Regenerate Proposal" — only available in EDITING state]
    → State → REGENERATING
    → Chat disabled, spinner shown
    → Backend: regenerates proposal with constraint applied + rewrites analysis text
    → State → PROPOSAL_READY (new proposal, constraint visible in ParameterChips)
    → "Regenerate Proposal" goes back to inactive

[Click "Approve Batch B4"]
    → State → APPROVED → RUNNING
    → New batch JSON written, next cycle begins

[Sidebar "Reset Demo" button]
    → window.confirm("Reset demo? This will clear all data from B3 onward.")
    → POST /api/reset
    → Clears state.json, deletes B3+ batch files, deletes processed/*.png
    → Redirects to IDLE / WelcomePage
```

---

## 2. All Issues

### 🔴 P0 — Critical for Demo

#### Issue 1: State persists across server restarts
**Symptom:** After restarting frontend + backend, `state.json` still holds the previous state
(e.g., PROPOSAL_READY with B3 data). User opens the app and sees last session's results
with no starting point — extremely confusing.
**Root cause:** `state.json` is written to disk and never cleared on startup.
**Decision:** Reset state to IDLE automatically on server startup. This is a demo system;
cross-session persistence requires user login, which is out of scope.
**Change:** `backend/main.py` — FastAPI `@app.on_event("startup")` calls `state_manager.reset_to_idle()`

#### Issue 2: Processed images not cleared on reset
**Symptom:** `static/images/processed/` retains PNGs from the previous run.
Old batch images appear in the UI after a fresh start.
**Change:** `reset_to_idle()` deletes all `.png` files in `processed/` (keeps directory structure).

#### Issue 3: No navigation sidebar
**Symptom:** No way to switch between Dashboard, History, and Analysis pages through the UI.
**Change:** New `Sidebar.tsx` + `AppLayout.tsx`. WelcomePage is sidebar-free (full-screen).
All other states (RUNNING, PROCESSING, ANALYZING, PROPOSAL_READY, etc.) render inside AppLayout.

---

### 🟡 P1 — Usability

#### Issue 4: Chat box takes up too much space
**Symptom:** The current chat area always renders a large bordered box (320px max-height)
even when there are zero messages, plus a separate input row — disproportionately large and
nothing like the compact floating bar in Claude or ChatGPT.
**Fix:**
- Message history area: hidden when empty; `max-h-40 overflow-y-auto` when messages exist
- Input: single-line `<input>` or auto-grow textarea (max 3 lines), no surrounding large border
- Overall pinned-bottom section height: ~60px when no messages, grows naturally with history
- Style: subtle top border + background, no extra rounded box wrapper when empty

#### Issue 5: "Simulate Complete" button is semantically wrong
**Symptom:** Name implies a simulation feature; clicking it shows no response for ~10 seconds
(backend processing TIF images), so users assume it's broken.
**Fix:**
- Rename to **"Run Analysis"**
- Click → button immediately `disabled` + spinner icon
- Explanatory text above button:
  `"Batch {current_batch_id} experiments are running in the lab. When complete,
   click below to trigger AI image analysis and parameter optimization."`

#### Issue 6: RUNNING state lacks context
Already covered by the text in Issue 5.

#### Issue 7: Processing logs are not descriptive
**Current format:**
```
Processed EXP-B3-01: detected 9.6% GFP+ transfection efficiency
```

**Confirmed target format — two phases:**

*PROCESSING phase (one line per experiment, ~0.4s apart):*
```
[1/20]  EXP-B3-01 — 892 nuclei detected, 86 GFP+ cells → 9.6% efficiency
[2/20]  EXP-B3-02 — 1045 nuclei detected, 110 GFP+ cells → 10.5% efficiency
[3/20]  EXP-B3-03 — 978 nuclei detected, 123 GFP+ cells → 12.6% efficiency
...
[8/20]  EXP-B3-08 — 934 nuclei detected, 191 GFP+ cells → 20.4% efficiency
...
[20/20] EXP-B3-20 — 1102 nuclei detected, 149 GFP+ cells → 13.5% efficiency
✓  Image processing complete — top performer: EXP-B3-08 at 20.4%
```

*ANALYZING phase (real LangChain callback events, formatted to natural language):*
```
Running AI scientific analysis...
  Loading experiment data for batch B3...
  20 experiments loaded successfully.
  Analyzing results across 20 experiments to find the top performer...
  Top performer: EXP-B3-08 at 20.4% efficiency (batch mean 9.6%, std ±4.4%)
  Generating optimized parameter candidates for batch B4...
  20 parameter sets generated, centered on pH 6.42, 38°C, 0.245 mg/mL.
  Selecting fluorescence images for comparison...
  Optimal image: EXP-B3-08 — Baseline image: EXP-B3-11
✓  Proposal ready for researcher review.
```

No raw JSON ever reaches the frontend. Each tool event is converted to a natural language
sentence before being appended to `processing_log`.

**Backend changes required:**
- `image_processing.py` — `compute_transfection_rate()` returns a dict
  `{"rate": float, "total_nuclei": int, "gfp_positive": int}` instead of a bare float
- `process_experiment()` surfaces `total_nuclei` and `gfp_positive` in its return dict
- `main.py` — `process_batch_with_log()` builds the `[N/20] ... nuclei detected ... GFP+ cells → R%` string
- `agent.py` — new `LabMindCallbackHandler(BaseCallbackHandler)` class with `on_tool_start`
  and `on_tool_end` hooks; each hook maps tool name + raw input/output to the natural language
  strings above; handler calls `state_manager.append_processing_log()` directly; handler is
  passed into `AgentExecutor` at construction time

---

### 🟢 P2 — Experience Polish

#### Issue 8: "Analysis" sidebar page is missing (needs a real page)
**Current state:** There is no `/analysis` route. The sidebar "Analysis" item has nowhere to go.
**What this page should be:** A historical data visualization dashboard, separate from the main
experiment dashboard. Researchers use it to review all past batches in context.

**Content:**
- **Line chart (Efficiency Trend):** X-axis = batch ID (B1, B2, B3…), Y-axis = transfection rate.
  Two lines: best efficiency per batch and mean efficiency per batch. Shows convergence.
- **Bar chart (Current Batch Distribution):** X-axis = experiment ID within current batch,
  Y-axis = transfection rate. Highlights top performer in gold, baseline in muted color.
- **Insights panel:** 2–4 computed text observations, e.g.
  "Best efficiency improved +36% from B2 → B3."
  "Batch mean is stabilizing around 10%, indicating approach to a local optimum."

**Data source:** All charts are built from `GET /api/batches` (summaries) and
`GET /api/batch/{id}` (per-experiment detail). No new API endpoint needed.
**Chart library:** Recharts (already available in Next.js ecosystem; lightweight).

#### Issue 9: Metric cards — replace one with a more meaningful metric
**Current 4 cards:** Current Batch / Best Transfection / Next Proposal / vs Prior Batch
**Problem:** "Next Proposal" is just a batch ID label (e.g., "B4") — not a meaningful metric.
The researcher already sees this in the ActionRow ("Approve Batch B4").

**Updated 4 cards:**
| Card | Value | Source |
|---|---|---|
| **Current Batch** | e.g., "B3" | `status.current_batch_id` |
| **Best Efficiency** | e.g., "20%" | max rate in current batch |
| **Batch Mean** | e.g., "9.6%" | mean rate in current batch |
| **vs Prior Batch** | e.g., "+36%" | (best_B3 − best_B2) / best_B2 |

Together these tell a complete story: where we are, what the peak is, what the typical level is,
and whether we're improving. Change in `MetricCards.tsx`.

#### Issue 10: WelcomePage could use stronger intro copy
**Current text:** "AI-guided mRNA-LNP parameter optimization. Each batch is analyzed by a
LangChain agent that proposes the next experimental conditions."
This is accurate but minimal. New users don't understand what the visual workflow will look like.
**Fix:** Add 1–2 sentences below that preview the demo flow, e.g.:
"Upload a completed batch of fluorescence microscopy images → the AI agent analyzes GFP
transfection efficiency across all wells → proposes optimized parameters for the next batch.
Review, chat, and approve — then repeat."
Keep the "Begin Experiment Batch" button.

#### Issue 11: Image fade-in on transition
**Fix:** When `ThinkingPanel` → `ImageComparison` transition occurs, add `animate-fadeIn`
on the `ImageComparison` wrapper.
Add keyframe to `tailwind.config.ts`:
```ts
fadeIn: {
  '0%':   { opacity: '0', transform: 'translateY(8px)' },
  '100%': { opacity: '1', transform: 'translateY(0)' },
}
animation: { fadeIn: 'fadeIn 0.6s ease-out' }
```

---

## 3. Researcher Edit Flow — Detailed State Machine

This clarifies the PROPOSAL_READY → EDITING → REGENERATING → PROPOSAL_READY cycle.
Editing is **chat-based** (researcher describes constraints in natural language), not a form.

```
PROPOSAL_READY
  ActionRow: [APPROVE BATCH B4 ●] [REGENERATE PROPOSAL ○ (inactive)]
  Chat: enabled

  ↓ Researcher sends general question
  → Agent replies, state stays PROPOSAL_READY

  ↓ Researcher sends constraint
    (backend detects keywords: exclude, avoid, cap, limit, max, min, etc.)
  → State: PROPOSAL_READY → EDITING
  → StatusPill: "EDITING"
  → latest_constraints saved in state.json
  → Agent acknowledges constraint ("Understood — I'll exclude concentrations above 0.3 mg/mL
    in the regenerated proposal.")
  → ActionRow: [APPROVE BATCH B4 ○ (inactive)] [REGENERATE PROPOSAL ●]

  ↓ Researcher clicks "REGENERATE PROPOSAL"
  → State: EDITING → REGENERATING
  → Chat disabled ("Regenerating proposal…")
  → Backend (run_regeneration):
      1. Load current batch results
      2. Find top performer
      3. Call generate_next_batch with top_performer + latest_constraints
      4. Rewrite analysis text to incorporate constraint rationale
      5. Write new pending.json proposal
  → State: REGENERATING → PROPOSAL_READY
  → ActionRow: [APPROVE BATCH B4 ●] [REGENERATE PROPOSAL ○]
  → Chat re-enabled

  ↓ Researcher clicks "APPROVE BATCH B4"
  → State: PROPOSAL_READY → APPROVED → RUNNING
  → New batch JSON written, new experiment cycle begins
```

**Frontend behavior mapping:**
- `EDITING` state: "Approve" button dims, "Regenerate" button gains gold border
- `REGENERATING` state: both buttons dim, spinner in pinned bottom area
- Constraints accumulate in the same session (each constraint chat → overrides `latest_constraints`
  with the latest message; multiple constraints → researcher should combine them in one message)

---

## 4. All Required Changes

### 4.1 Backend

| Change | File | Description |
|---|---|---|
| `reset_to_idle()` method | `state_manager.py` | Resets state.json to IDLE defaults + deletes processed/*.png + deletes B3+ batch JSON files |
| Auto-reset on startup | `main.py` | `@app.on_event("startup")` calls `state_manager.reset_to_idle()` |
| `POST /api/reset` endpoint | `main.py` | Manual reset triggered by sidebar "Reset Demo" button |
| Richer log format | `image_processing.py` | `compute_transfection_rate()` returns dict with `rate`, `total_nuclei`, `gfp_positive` |
| Richer log format | `main.py` | `process_batch_with_log()` builds `[N/20] EXP-Bx-xx — Y nuclei, Z GFP+ → R%` log string |

### 4.2 Frontend

| Change | File | Description |
|---|---|---|
| New sidebar | `Sidebar.tsx` (new) | Home / History / Analysis nav links + Reset Demo button at bottom |
| New layout wrapper | `AppLayout.tsx` (new) | Renders Sidebar on left + main content on right; used by all non-Welcome pages |
| Wire AppLayout into routing | `page.tsx` + `history/page.tsx` + `experiments/page.tsx` | Wrap non-IDLE views in `<AppLayout>` |
| New Analysis page | `app/analysis/page.tsx` (new) | Line chart (efficiency trend) + bar chart (batch distribution) + insights panel |
| Update MetricCards | `MetricCards.tsx` | Replace "Next Proposal" card with "Batch Mean" |
| Compact chat bar | `ChatInterface.tsx` | Hide history area when empty; compact input bar; remove outer bordered box when empty |
| RunningView UX | `RunningView.tsx` | Rename button → "Run Analysis"; add `loading` state; add explanatory text above |
| WelcomePage copy | `WelcomePage.tsx` | Add 1–2 sentences previewing the demo workflow |
| Image fade-in | `AgentAnalysis.tsx` + `tailwind.config.ts` | `animate-fadeIn` on ImageComparison appearance |

---

## 5. Implementation Order

| Step | Task | Priority |
|---|---|---|
| 1 | `state_manager.reset_to_idle()` + startup event + `POST /api/reset` | P0 |
| 2 | Richer processing log format (backend) | P1 |
| 3 | `Sidebar.tsx` + `AppLayout.tsx` + wire into routes | P0 |
| 4 | New `Analysis` page with charts (Recharts) | P2 |
| 5 | Update `MetricCards.tsx` (replace Next Proposal → Batch Mean) | P1 |
| 6 | Compact `ChatInterface.tsx` | P1 |
| 7 | `RunningView.tsx` — button rename + loading + text | P1 |
| 8 | `WelcomePage.tsx` — expanded intro copy | P2 |
| 9 | Image fade-in animation | P2 |

---

## 6. Unchanged Components

The following are working correctly and must not be modified:
- `ThinkingPanel` (inside `AgentAnalysis.tsx`)
- `ImageComparison.tsx`
- `AnalysisText.tsx`
- `ParameterChips.tsx`
- `ActionRow.tsx`
- `StatusPill.tsx`
- `usePolling` hook
- All backend agent/tools logic

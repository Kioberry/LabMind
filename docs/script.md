# LabMind Demo Script — 3分钟版本

**目标时长：2:45–3:00**

---

## 录制前准备

- Backend running locally (`uvicorn main:app --reload`)
- Frontend running (`npm run dev`)
- 状态为 IDLE（点 Reset Demo 或重启 backend）
- B1、B2 已作为历史数据存在
- 浏览器全屏，zoom 90–100%

---

## SEGMENT 1 — HOOK + ARCHITECTURE (0:00–0:20)

**屏幕：** Welcome page

**说：**

> "LabMind is an AI agent dashboard for autonomous experiment optimization — the core loop inside an AI factory. Backend: Python FastAPI + LangChain + Claude Sonnet. Frontend: Next.js. The science is real:I process actual fluorescence microscopy TIF files from the Broad Institute using Otsu thresholding, and optimize parameters via Bayesian Latin Hypercube Sampling. Let me run it."

---

## SEGMENT 2 — BEGIN → PROCESSING LOG (0:20–0:55)

**动作：** 点 "Begin Experiment Batch" → 等进入 RUNNING → 点 "Run Analysis"

**说：**
> "Batch B2 — 20 parallel experiments. Triggering analysis."

**等 log 开始出现后说：**
> "Now watch the processing log. The system is reading real TIF files — Hoechst channel for total nuclei, GFP channel for transfection-positive cells. Each line is one experiment completing in real time."

**指向一行 log（例如 `[3/20] EXP-B2-03 — 248 nuclei, 189 GFP+ → 76.2%`）：**
> "Actual computed values, not mock data."

**等 log 继续，说：**
> "Once image processing finishes, the LangChain ReAct agent kicks in autonomously — it calls four tools in sequence: load results, find top performer, run Bayesian sampling, retrieve comparison images. No hardcoded order."

---

## SEGMENT 3 — PROPOSAL READY: WALK THE PAGE (0:55–1:45)

**屏幕：** AgentAnalysis page，从上往下走

**说：**
> "Proposal Ready. Walking top to bottom."

- **Metric cards：** "84% best transfection — 31% improvement over B1 baseline. That's what Bayesian convergence looks like."
- **Image comparison：** "These are the actual processed GFP channel PNGs — top performer well versus baseline. Served directly from the TIF pipeline."
- **Analysis text：** "Claude's scientific analysis — what drove the top performance, statistical context, and justification for the next batch range."
- **Parameter chips：** "Gold = optimal B2 parameters. Below: proposed B3 ranges from the Bayesian sampler, ±25% around the top performer."

---

## SEGMENT 4 — CONSTRAINT + REGENERATE (1:45–2:20)

**动作：** 在 chat 输入框打以下内容并发送：

```
exclude concentrations above 0.3 mg/mL — cytotoxicity concern
```

**说：**
> "This is the human-in-the-loop piece. I can constrain the agent before approving."

**等 agent 回复后：**
> "State moves to Editing. Now I click Regenerate — the agent re-runs sampling with the constraint enforced, and Claude rewrites the analysis to incorporate the rationale."

**动作：** 点 "Regenerate Proposal"，等回到 PROPOSAL_READY

**指向 parameter chips：**
> "Concentration range now caps at 0.3. Constraint applied."

---

## SEGMENT 5 — APPROVE + HISTORY + CLOSE (2:20–3:00)

**动作：** 点 "Approve Batch B3"，等状态转换

**说：**
> "Approving commits the proposal to disk and resets the cycle. Now the sidebar."

**动作：** 依次点 History → Analysis → Experiments，每页停留 3–4 秒

**说：**
> "History: batch heatmap showing convergence — B1 mostly dark, B2 tightening. Analysis: efficiency trend and distribution charts with Recharts. Experiments: every individual run across all batches, sortable, filterable."

**最后一句：**
> "Built in two days. Full-stack, real image processing, real Bayesian optimization, real Claude reasoning — and a human always has the last word before the next batch runs."

---

## 时间分配

| Segment | 内容 | 时长 |
|---|---|---|
| 1 | Hook + 技术栈 | 20s |
| 2 | Begin → Processing Log → Analyzing | 35s |
| 3 | Proposal Ready 页面逐项说明 | 50s |
| 4 | Chat constraint + Regenerate | 35s |
| 5 | Approve + 三个页面 + 结尾 | 40s |
| **Total** | | **~3:00** |

---

## 执行注意事项

- **录制前完整跑一遍**：确认 PROCESSING log 正常 streaming、B3 approve 后 History 能显示三个 batch
- **Segment 3 语速最慢**：那是内容最密集的部分，给她时间看清楚每个区域
- **不需要解释的东西**：不要停下来解释状态机的 8 个状态、不要道歉说"这是 demo 版本"

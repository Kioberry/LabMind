'use client';
import { usePolling } from '@/hooks/usePolling';
import WelcomePage from '@/components/WelcomePage';
import RunningView from '@/components/RunningView';
import AgentAnalysis from '@/components/AgentAnalysis';
import AppLayout from '@/components/AppLayout';
import type { SystemState } from '@/lib/types';

const ANALYSIS_STATES: SystemState[] = ['PROCESSING', 'ANALYZING', 'PROPOSAL_READY', 'EDITING', 'REGENERATING'];
const RUNNING_STATES: SystemState[] = ['RUNNING', 'COMPLETE', 'APPROVED'];

export default function Home() {
  const status = usePolling(4000);

  if (!status || status.current_state === 'IDLE') {
    return <WelcomePage />;
  }
  if (ANALYSIS_STATES.includes(status.current_state)) {
    return <AppLayout><AgentAnalysis status={status} /></AppLayout>;
  }
  if (RUNNING_STATES.includes(status.current_state)) {
    return <AppLayout><RunningView status={status} /></AppLayout>;
  }
  return <WelcomePage />;
}

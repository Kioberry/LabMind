import { StatusResponse, BatchResponse, BatchSummary } from './types';

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export const api = {
  getStatus: (): Promise<StatusResponse> =>
    fetch(`${BASE_URL}/api/status`).then(r => r.json()),

  getBatch: (batchId: string): Promise<BatchResponse> =>
    fetch(`${BASE_URL}/api/batch/${batchId}`).then(r => r.json()),

  getAllBatches: (): Promise<BatchSummary[]> =>
    fetch(`${BASE_URL}/api/batches`).then(r => r.json()),

  simulate: (): Promise<{ status: string }> =>
    fetch(`${BASE_URL}/api/simulate`, { method: 'POST' }).then(r => r.json()),

  chat: (message: string): Promise<{ response: string; state_changed: boolean; new_state: string }> =>
    fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }).then(r => r.json()),

  approve: (): Promise<{ status: string }> =>
    fetch(`${BASE_URL}/api/approve`, { method: 'POST' }).then(r => r.json()),

  regenerate: (): Promise<{ status: string }> =>
    fetch(`${BASE_URL}/api/regenerate`, { method: 'POST' }).then(r => r.json()),

  reset: (): Promise<{ status: string }> =>
    fetch(`${BASE_URL}/api/reset`, { method: 'POST' }).then(r => r.json()),
};

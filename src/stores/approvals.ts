import { create } from 'zustand';
import { hostApiFetch } from '@/lib/host-api';

export interface ApprovalItem {
  id: string;
  key?: string;
  sessionKey?: string;
  agentId?: string;
  state?: string;
  status?: string;
  decision?: string;
  command?: string;
  prompt?: string;
  reason?: string;
  createdAt?: string;
  requestedAt?: string;
  updatedAt?: string;
  expiresAt?: string;
}

interface ApprovalsState {
  approvals: ApprovalItem[];
  loading: boolean;
  error: string | null;
  fetchApprovals: () => Promise<void>;
  approveItem: (id: string, reason?: string) => Promise<void>;
  rejectItem: (id: string, reason: string) => Promise<void>;
}

export const useApprovalsStore = create<ApprovalsState>((set, get) => ({
  approvals: [],
  loading: false,
  error: null,

  fetchApprovals: async () => {
    set({ loading: true, error: null });
    try {
      const data = await hostApiFetch<{ approvals?: ApprovalItem[] }>('/api/approvals');
      const raw = Array.isArray(data?.approvals) ? data.approvals : [];
      // Normalise: ensure every item has an id field
      const approvals = raw.map((item) => ({
        ...item,
        id: item.id ?? item.key ?? String(Math.random()),
      }));
      set({ approvals, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  approveItem: async (id: string, reason?: string) => {
    await hostApiFetch('/api/approvals/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId: id, reason }),
    });
    await get().fetchApprovals();
  },

  rejectItem: async (id: string, reason: string) => {
    await hostApiFetch('/api/approvals/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId: id, reason }),
    });
    await get().fetchApprovals();
  },
}));

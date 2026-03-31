import { create } from 'zustand';

export type RightPanelType = 'file' | 'agent' | 'task' | null;

interface RightPanelState {
  open: boolean;
  type: RightPanelType;
  agentId: string | null;
  taskId: string | null;
  openPanel: (type: Exclude<RightPanelType, null>, id?: string) => void;
  closePanel: () => void;
}

export const useRightPanelStore = create<RightPanelState>((set) => ({
  open: false,
  type: null,
  agentId: null,
  taskId: null,
  openPanel: (type, id) => {
    if (type === 'agent') {
      set({ open: true, type, agentId: id ?? null, taskId: null });
    } else if (type === 'task') {
      set({ open: true, type, taskId: id ?? null, agentId: null });
    } else {
      set({ open: true, type, agentId: null, taskId: null });
    }
  },
  closePanel: () => set({ open: false, type: null, agentId: null, taskId: null }),
}));

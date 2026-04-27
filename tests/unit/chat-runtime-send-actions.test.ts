import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeIpcMock = vi.fn();

vi.mock('@/lib/api-client', () => ({
  invokeIpc: (...args: unknown[]) => invokeIpcMock(...args),
}));

vi.mock('@/stores/agents', () => ({
  useAgentsStore: {
    getState: () => ({
      agents: [],
    }),
  },
}));

type ChatLikeState = {
  currentSessionKey: string;
  currentAgentId: string;
  sessions: Array<{ key: string; displayName?: string }>;
  messages: Array<{ role: string; content?: unknown }>;
  sessionLabels: Record<string, string>;
  sessionLastActivity: Record<string, number>;
  sending: boolean;
  activeRunId: string | null;
  streamingText: string;
  streamingMessage: unknown | null;
  streamingTools: unknown[];
  pendingFinal: boolean;
  lastUserMessageAt: number | null;
  pendingToolImages: unknown[];
  error: string | null;
  loadHistory: ReturnType<typeof vi.fn>;
};

function makeHarness(initial?: Partial<ChatLikeState>) {
  let state: ChatLikeState = {
    currentSessionKey: 'agent:main:main',
    currentAgentId: 'main',
    sessions: [{ key: 'agent:main:main' }],
    messages: [],
    sessionLabels: {},
    sessionLastActivity: {},
    sending: true,
    activeRunId: 'run-active',
    streamingText: 'streaming',
    streamingMessage: { role: 'assistant', content: 'partial' },
    streamingTools: [{ name: 'tool-a' }],
    pendingFinal: true,
    lastUserMessageAt: 123,
    pendingToolImages: [{ fileName: 'a.png' }],
    error: null,
    loadHistory: vi.fn(),
    ...initial,
  };

  const set = (partial: Partial<ChatLikeState> | ((s: ChatLikeState) => Partial<ChatLikeState>)) => {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...patch };
  };
  const get = () => state;
  return { set, get, read: () => state };
}

describe('chat runtime send actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    invokeIpcMock.mockResolvedValue({ ok: true });
  });

  it('abortRun clears activeRunId before the next send can start', async () => {
    const { createRuntimeSendActions } = await import('@/stores/chat/runtime-send-actions');
    const h = makeHarness();
    const actions = createRuntimeSendActions(h.set as never, h.get as never);

    await actions.abortRun();

    expect(invokeIpcMock).toHaveBeenCalledWith(
      'gateway:rpc',
      'chat.abort',
      { sessionKey: 'agent:main:main' },
    );
    expect(h.read()).toMatchObject({
      sending: false,
      activeRunId: null,
      streamingText: '',
      streamingMessage: null,
      streamingTools: [],
      pendingFinal: false,
      lastUserMessageAt: null,
      pendingToolImages: [],
    });
  });
});

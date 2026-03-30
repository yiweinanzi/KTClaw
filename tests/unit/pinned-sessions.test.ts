import { beforeEach, describe, expect, it } from 'vitest';
import {
  PINNED_SESSIONS_STORAGE_KEY,
  readPinnedSessionKeys,
  writePinnedSessionKeys,
} from '@/lib/pinned-sessions';

const KTCLAW_PINNED_KEY = 'ktclaw-sidebar-pinned-sessions';
const LEGACY_PINNED_KEY = 'clawx-sidebar-pinned-sessions';

describe('pinned sessions storage compatibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates legacy pinned-session storage to KTClaw key on read', () => {
    localStorage.setItem(LEGACY_PINNED_KEY, JSON.stringify(['session-a', 'session-b']));

    const keys = readPinnedSessionKeys();

    expect(keys).toEqual(['session-a', 'session-b']);
    expect(PINNED_SESSIONS_STORAGE_KEY).toBe(KTCLAW_PINNED_KEY);
    expect(localStorage.getItem(KTCLAW_PINNED_KEY)).toBe(JSON.stringify(['session-a', 'session-b']));
    expect(localStorage.getItem(LEGACY_PINNED_KEY)).toBeNull();
  });

  it('writes pinned sessions to KTClaw key and clears legacy key', () => {
    localStorage.setItem(LEGACY_PINNED_KEY, JSON.stringify(['legacy-session']));

    writePinnedSessionKeys(['session-new']);

    expect(localStorage.getItem(KTCLAW_PINNED_KEY)).toBe(JSON.stringify(['session-new']));
    expect(localStorage.getItem(LEGACY_PINNED_KEY)).toBeNull();
  });
});


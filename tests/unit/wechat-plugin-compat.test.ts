// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { patchWeChatPluginCompatibilitySource } from '@electron/utils/wechat-plugin-compat';

describe('wechat plugin compatibility shim', () => {
  it('replaces normalizeAccountId sdk import with local shim', () => {
    const source = [
      'import type { OpenClawConfig } from "openclaw/plugin-sdk/core";',
      'import { normalizeAccountId } from "openclaw/plugin-sdk/account-id";',
      'const normalized = normalizeAccountId(accountId);',
    ].join('\n');

    const patched = patchWeChatPluginCompatibilitySource(source);

    expect(patched).toContain('KTClaw compatibility shim');
    expect(patched).not.toContain('openclaw/plugin-sdk/account-id');
    expect(patched).toContain('const normalized = normalizeAccountId(accountId);');
  });
});

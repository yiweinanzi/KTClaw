import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const NORMALIZE_IMPORT = 'import { normalizeAccountId } from "openclaw/plugin-sdk/account-id";';
const SHIM_MARKER = '// KTClaw compatibility shim for OpenClaw 2026.3.22';
const NORMALIZE_SHIM = `${SHIM_MARKER}
function normalizeAccountId(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const normalized = trimmed
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
  return normalized || "default";
}`;

export function patchWeChatPluginCompatibilitySource(source: string): string {
  if (!source.includes(NORMALIZE_IMPORT)) {
    return source;
  }
  if (source.includes(SHIM_MARKER)) {
    return source;
  }
  return source.replace(NORMALIZE_IMPORT, NORMALIZE_SHIM);
}

export function patchInstalledWeChatPluginCompatibility(pluginRoot: string): boolean {
  const candidateFiles = [
    join(pluginRoot, 'src', 'channel.ts'),
    join(pluginRoot, 'src', 'channel.js'),
  ];

  let patched = false;
  for (const filePath of candidateFiles) {
    if (!existsSync(filePath)) continue;
    const original = readFileSync(filePath, 'utf8');
    const next = patchWeChatPluginCompatibilitySource(original);
    if (next !== original) {
      writeFileSync(filePath, next, 'utf8');
      patched = true;
    }
  }

  return patched;
}

const FEISHU_NORMALIZE_IMPORT = "import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from 'openclaw/plugin-sdk';";
const FEISHU_NORMALIZE_SHIM = `${SHIM_MARKER}
const DEFAULT_ACCOUNT_ID = 'default';
function normalizeAccountId(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const normalized = trimmed
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '');
  return normalized || DEFAULT_ACCOUNT_ID;
}`;

export function patchFeishuPluginCompatibilitySource(source: string): string {
  if (!source.includes(FEISHU_NORMALIZE_IMPORT)) {
    return source;
  }
  if (source.includes(SHIM_MARKER)) {
    return source;
  }
  return source.replace(FEISHU_NORMALIZE_IMPORT, FEISHU_NORMALIZE_SHIM);
}

export function patchInstalledFeishuPluginCompatibility(pluginRoot: string): boolean {
  const candidateFiles = [
    join(pluginRoot, 'src', 'core', 'accounts.js'),
    join(pluginRoot, 'src', 'core', 'accounts.ts'),
  ];

  let patched = false;
  for (const filePath of candidateFiles) {
    if (!existsSync(filePath)) continue;
    const original = readFileSync(filePath, 'utf8');
    const next = patchFeishuPluginCompatibilitySource(original);
    if (next !== original) {
      writeFileSync(filePath, next, 'utf8');
      patched = true;
    }
  }

  return patched;
}

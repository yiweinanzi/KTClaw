import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getOpenClawConfigDir } from '../../utils/paths';

const FEISHU_PLUGIN_ROOT = join(getOpenClawConfigDir(), 'extensions', 'feishu-openclaw-plugin');

export async function readFeishuOpenClawConfigJson(): Promise<Record<string, unknown> | null> {
  try {
    const configPath = join(getOpenClawConfigDir(), 'config.json');
    const raw = await readFile(configPath, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function importInstalledFeishuPluginModule(
  relativePath = 'index.js',
): Promise<Record<string, unknown>> {
  const fullPath = join(FEISHU_PLUGIN_ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Feishu plugin module not found: ${fullPath}`);
  }
  return import(pathToFileURL(fullPath).href) as Promise<Record<string, unknown>>;
}

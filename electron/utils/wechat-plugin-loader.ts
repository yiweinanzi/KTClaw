import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const WECHAT_PLUGIN_ROOT = join(homedir(), '.openclaw', 'extensions', 'wechat');

export async function importWeChatPluginModule(relativePath: string): Promise<Record<string, unknown>> {
  const fullPath = join(WECHAT_PLUGIN_ROOT, relativePath);
  return import(pathToFileURL(fullPath).href) as Promise<Record<string, unknown>>;
}

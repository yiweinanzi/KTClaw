import type { ChannelPlugin } from './types';

const registry = new Map<string, ChannelPlugin>();

export function registerChannel(plugin: ChannelPlugin): void {
  registry.set(plugin.id, plugin);
}

export function getChannel(id: string): ChannelPlugin | undefined {
  return registry.get(id);
}

export function listChannels(): ChannelPlugin[] {
  return [...registry.values()];
}

export function getEnabledChannels(config: Record<string, { enabled?: boolean }>): ChannelPlugin[] {
  return [...registry.values()].filter((plugin) => {
    const channelConfig = config[plugin.id];
    // Enabled by default if no config or enabled not explicitly set to false
    return channelConfig?.enabled !== false;
  });
}

/** @internal — test-only, not re-exported from index.ts */
export function _clearForTesting(): void {
  registry.clear();
}

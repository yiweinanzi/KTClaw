// Lazy-load electron-store (ESM module) from the main process only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let providerStore: any = null;

export async function getKTClawProviderStore() {
  if (!providerStore) {
    const Store = (await import('electron-store')).default;
    providerStore = new Store({
      name: 'clawx-providers',
      defaults: {
        schemaVersion: 0,
        providers: {} as Record<string, unknown>,
        providerAccounts: {} as Record<string, unknown>,
        // Legacy plaintext key cache. New writes should go through providerSecrets only.
        apiKeys: {} as Record<string, string>,
        // Main secret payloads, wrapped by electron safeStorage in secret-store.
        providerSecrets: {} as Record<string, unknown>,
        defaultProvider: null as string | null,
        defaultProviderAccountId: null as string | null,
      },
    });
  }

  return providerStore;
}

type ElectronShim = {
  ipcRenderer: {
    invoke: (...args: unknown[]) => Promise<unknown>;
    on: (...args: unknown[]) => (() => void) | void;
    once: (...args: unknown[]) => void;
    off: (...args: unknown[]) => void;
  };
  openExternal: (url: string) => Promise<void>;
  platform: string;
  isDev: boolean;
  __ktclawBrowserPreviewShim?: boolean;
};

function createElectronShim(): ElectronShim {
  return {
    ipcRenderer: {
      invoke: async () => undefined,
      on: () => () => undefined,
      once: () => undefined,
      off: () => undefined,
    },
    openExternal: async (url: string) => {
      if (typeof window !== 'undefined' && typeof window.open === 'function') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    platform: 'web',
    isDev: true,
    __clawxBrowserPreviewShim: true,
  };
}

export function ensureBrowserPreviewElectronShim(): void {
  if (typeof window === 'undefined') return;
  if (window.electron) return;

  window.electron = createElectronShim() as never;
}

export function isBrowserPreviewMode(): boolean {
  if (typeof window === 'undefined') return false;
  const electron = window.electron as ElectronShim | undefined;
  return electron?.__clawxBrowserPreviewShim === true;
}

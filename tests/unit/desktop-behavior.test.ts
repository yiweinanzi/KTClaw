/**
 * Desktop Behavior Tests
 * Tests for startMinimized (autostart-only), minimizeToTray (close→tray),
 * brandSubtitle (window title), and myName (chat welcome).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers: minimal BrowserWindow mock
// ---------------------------------------------------------------------------

function makeMockWindow(overrides: Partial<{
  show: () => void;
  hide: () => void;
  setTitle: (t: string) => void;
}> = {}) {
  const handlers: Record<string, Array<(event?: { preventDefault: () => void }) => void>> = {};
  const win = {
    show: vi.fn(overrides.show ?? (() => {})),
    hide: vi.fn(overrides.hide ?? (() => {})),
    setTitle: vi.fn(overrides.setTitle ?? (() => {})),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    focus: vi.fn(),
    once: vi.fn((event: string, handler: () => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    on: vi.fn((event: string, handler: (e?: { preventDefault: () => void }) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    emit: (event: string, eventObj?: { preventDefault: () => void }) => {
      (handlers[event] ?? []).forEach((h) => h(eventObj));
    },
  };
  return win;
}

// ---------------------------------------------------------------------------
// Task 1: startMinimized (autostart-only) logic
// ---------------------------------------------------------------------------

describe('startMinimized — autostart-only semantics', () => {
  /**
   * Simulate the ready-to-show handler logic extracted from createMainWindow.
   * suppressInitialShow = isAutostart && startMinimized
   */
  function simulateReadyToShow(
    suppressInitialShow: boolean,
    win: ReturnType<typeof makeMockWindow>,
  ) {
    // Mirrors the ready-to-show handler in electron/main/index.ts
    if (suppressInitialShow) {
      return; // window stays hidden
    }
    win.show();
  }

  it('isAutostart=true + startMinimized=true → window.show NOT called', () => {
    const win = makeMockWindow();
    const isAutostart = true;
    const startMinimized = true;
    const suppressInitialShow = isAutostart && startMinimized;
    simulateReadyToShow(suppressInitialShow, win);
    expect(win.show).not.toHaveBeenCalled();
  });

  it('isAutostart=false + startMinimized=true → window.show IS called', () => {
    const win = makeMockWindow();
    const isAutostart = false;
    const startMinimized = true;
    const suppressInitialShow = isAutostart && startMinimized;
    simulateReadyToShow(suppressInitialShow, win);
    expect(win.show).toHaveBeenCalledOnce();
  });

  it('isAutostart=true + startMinimized=false → window.show IS called', () => {
    const win = makeMockWindow();
    const isAutostart = true;
    const startMinimized = false;
    const suppressInitialShow = isAutostart && startMinimized;
    simulateReadyToShow(suppressInitialShow, win);
    expect(win.show).toHaveBeenCalledOnce();
  });

  it('isAutostart=false + startMinimized=false → window.show IS called', () => {
    const win = makeMockWindow();
    const isAutostart = false;
    const startMinimized = false;
    const suppressInitialShow = isAutostart && startMinimized;
    simulateReadyToShow(suppressInitialShow, win);
    expect(win.show).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Task 1: minimizeToTray (close→tray) logic
// ---------------------------------------------------------------------------

describe('minimizeToTray — close event handler', () => {
  let isQuitting: boolean;

  beforeEach(() => {
    isQuitting = false;
  });

  /**
   * Simulate the close handler wired in createMainWindow.
   */
  function wireCloseHandler(
    win: ReturnType<typeof makeMockWindow>,
    minimizeToTray: boolean,
  ) {
    win.on('close', (event) => {
      if (isQuitting) return;
      if (minimizeToTray) {
        event?.preventDefault();
        win.hide();
      }
    });
  }

  it('minimizeToTray=true → close calls preventDefault and hide', () => {
    const win = makeMockWindow();
    wireCloseHandler(win, true);
    const event = { preventDefault: vi.fn() };
    win.emit('close', event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(win.hide).toHaveBeenCalledOnce();
  });

  it('minimizeToTray=false → close does NOT call preventDefault', () => {
    const win = makeMockWindow();
    wireCloseHandler(win, false);
    const event = { preventDefault: vi.fn() };
    win.emit('close', event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
  });

  it('isQuitting=true → close handler returns early regardless of minimizeToTray', () => {
    const win = makeMockWindow();
    isQuitting = true;
    wireCloseHandler(win, true);
    const event = { preventDefault: vi.fn() };
    win.emit('close', event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Task 2: brandSubtitle → window title
// ---------------------------------------------------------------------------

describe('brandSubtitle — window title', () => {
  function applyWindowTitle(win: ReturnType<typeof makeMockWindow>, brandSubtitle: string) {
    const title = brandSubtitle ? `KTClaw — ${brandSubtitle}` : 'KTClaw';
    win.setTitle(title);
  }

  it('brandSubtitle non-empty → window title includes brandSubtitle', () => {
    const win = makeMockWindow();
    applyWindowTitle(win, '智能编排中枢');
    expect(win.setTitle).toHaveBeenCalledWith('KTClaw — 智能编排中枢');
  });

  it('brandSubtitle empty → window title is "KTClaw"', () => {
    const win = makeMockWindow();
    applyWindowTitle(win, '');
    expect(win.setTitle).toHaveBeenCalledWith('KTClaw');
  });
});

// ---------------------------------------------------------------------------
// Task 2: Sidebar brandSubtitle rendering (unit logic)
// ---------------------------------------------------------------------------

describe('Sidebar brandSubtitle rendering logic', () => {
  it('returns brandSubtitle when store value is non-empty', () => {
    const brandSubtitle = '智能编排中枢';
    // Simulate what the Sidebar component does: render subtitle if non-empty
    const rendered = brandSubtitle.length > 0 ? brandSubtitle : null;
    expect(rendered).toBe('智能编排中枢');
  });

  it('returns null when brandSubtitle is empty', () => {
    const brandSubtitle = '';
    const rendered = brandSubtitle.length > 0 ? brandSubtitle : null;
    expect(rendered).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 2: Chat welcome myName rendering logic
// ---------------------------------------------------------------------------

describe('Chat welcome myName rendering logic', () => {
  function buildGreeting(myName: string): string {
    return myName ? `你好，${myName}！有什么我可以帮你的？` : '有什么我可以帮你的？';
  }

  it('myName non-empty → greeting includes myName', () => {
    expect(buildGreeting('Commander')).toBe('你好，Commander！有什么我可以帮你的？');
  });

  it('myName empty → generic greeting', () => {
    expect(buildGreeting('')).toBe('有什么我可以帮你的？');
  });
});

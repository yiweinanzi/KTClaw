import { logger } from '../../utils/logger';

export const IMAGE_SEARCH_SEMANTIC_PREWARM_DELAY_MS = 5000;

type TimerHandle = ReturnType<typeof setTimeout>;

export interface ImageSearchSemanticPrewarmOptions {
  delayMs?: number;
  env?: Pick<
    NodeJS.ProcessEnv,
    'KTCLAW_DISABLE_IMAGE_SEARCH_PREWARM' | 'KTCLAW_ENABLE_IMAGE_SEARCH_PREWARM' | 'KTCLAW_IMAGE_SEARCH_ENABLE_SEMANTIC'
  >;
  logWarn?: (message: string, error: unknown) => void;
  prewarm?: () => Promise<void>;
  setTimer?: (handler: () => void, delayMs: number) => TimerHandle | number;
}

let scheduled = false;
let timerHandle: TimerHandle | number | null = null;

export function scheduleImageSearchSemanticPrewarm(options: ImageSearchSemanticPrewarmOptions = {}): void {
  const env = options.env ?? process.env;
  if (env.KTCLAW_DISABLE_IMAGE_SEARCH_PREWARM === '1') return;
  if (env.KTCLAW_ENABLE_IMAGE_SEARCH_PREWARM !== '1') return;
  if (env.KTCLAW_IMAGE_SEARCH_ENABLE_SEMANTIC !== '1') return;
  if (scheduled) return;

  scheduled = true;
  const delayMs = options.delayMs ?? IMAGE_SEARCH_SEMANTIC_PREWARM_DELAY_MS;
  const setTimer = options.setTimer ?? setTimeout;
  const logWarn = options.logWarn ?? ((message, error) => logger.warn(message, error));
  const prewarm = options.prewarm ?? defaultPrewarmMobileClip;

  timerHandle = setTimer(() => {
    void prewarm().catch((error) => {
      logWarn('Image semantic model prewarm failed:', error);
    });
  }, delayMs);
}

export function resetImageSearchSemanticPrewarmForTests(): void {
  scheduled = false;
  if (timerHandle && typeof timerHandle !== 'number') {
    clearTimeout(timerHandle);
  }
  timerHandle = null;
}

async function defaultPrewarmMobileClip(): Promise<void> {
  const { prewarmMobileClipSemanticProvider } = await import('./mobileclip-provider');
  await prewarmMobileClipSemanticProvider();
}

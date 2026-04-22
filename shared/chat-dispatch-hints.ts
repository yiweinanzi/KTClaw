export interface DispatchAttachmentLike {
  mimeType?: string | null;
}

export interface DispatchProviderAccountLike {
  enabled?: boolean;
  vendorId?: string | null;
  model?: string | null;
  fallbackModels?: string[] | null;
}

export type ImageUnderstandingAvailability = 'native' | 'fallback' | 'missing';

const DISPATCH_HINT_START = '[KTCLAW_DISPATCH_HINTS]';
const DISPATCH_HINT_END = '[/KTCLAW_DISPATCH_HINTS]';

const BROWSER_TASK_PATTERN = new RegExp([
  'browser',
  'web',
  'website',
  'page',
  'url',
  'login',
  'navigate',
  'click',
  'snapshot',
  'screenshot',
  'screen\\s*shot',
  'gui',
  'ui',
  '浏览器',
  '网页',
  '网站',
  '页面',
  '网址',
  '链接',
  '登录',
  '快照',
  '截图',
  '界面',
].join('|'), 'i');

const MULTISTEP_TASK_PATTERN = new RegExp([
  'multi-step',
  'step\\s*by\\s*step',
  'workflow',
  'end-to-end',
  'complex',
  'investigate',
  'debug',
  'research',
  'automation',
  '自动化',
  '多步',
  '逐步',
  '端到端',
  '复杂',
  '排查',
  '调试',
  '调研',
].join('|'), 'i');

// Known text-only models that explicitly do not support vision input.
// Default assumption is that any model may be vision-capable.
const TEXT_ONLY_MODEL_PATTERNS = [
  /\bdeepseek-chat\b/i,
  /\bdeepseek-reasoner\b/i,
];

const IMAGE_TOOL_FALLBACK_VENDORS = new Set([
  'anthropic',
  'openai',
  'google',
  'minimax-portal',
  'minimax-portal-cn',
]);

function normalizeText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function hasImageAttachments(
  attachments?: Array<DispatchAttachmentLike> | null,
): boolean {
  return (attachments ?? []).some((attachment) =>
    normalizeText(attachment?.mimeType).toLowerCase().startsWith('image/'));
}

export function modelLooksVisionCapable(modelId?: string | null): boolean {
  const normalized = normalizeText(modelId).toLowerCase();
  if (!normalized) return false;
  return !TEXT_ONLY_MODEL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function accountHasVisionFallback(account: DispatchProviderAccountLike): boolean {
  if (account.enabled === false) return false;

  if (modelLooksVisionCapable(account.model)) {
    return true;
  }

  const fallbackModels = Array.isArray(account.fallbackModels) ? account.fallbackModels : [];
  if (fallbackModels.some((entry) => modelLooksVisionCapable(entry))) {
    return true;
  }

  const vendorId = normalizeText(account.vendorId).toLowerCase();
  if (vendorId === 'ollama') {
    return true;
  }
  return IMAGE_TOOL_FALLBACK_VENDORS.has(vendorId);
}

export function resolveImageUnderstandingAvailability(params: {
  currentModel?: string | null;
  defaultModel?: string | null;
  accounts?: Array<DispatchProviderAccountLike> | null;
}): ImageUnderstandingAvailability {
  const activeModel = normalizeText(params.currentModel) || normalizeText(params.defaultModel);
  if (modelLooksVisionCapable(activeModel)) {
    return 'native';
  }

  const accounts = Array.isArray(params.accounts) ? params.accounts : [];
  if (accounts.some((account) => accountHasVisionFallback(account))) {
    return 'fallback';
  }

  return 'missing';
}

function buildDispatchHints(
  text: string,
  attachments?: Array<DispatchAttachmentLike> | null,
): string[] {
  const hints: string[] = [];
  const needsBrowserHints = BROWSER_TASK_PATTERN.test(text);
  const needsMultiStepHints = MULTISTEP_TASK_PATTERN.test(text);
  const needsImageHints = hasImageAttachments(attachments);

  if (!needsBrowserHints && !needsMultiStepHints && !needsImageHints) {
    return hints;
  }

  hints.push('Before answering, check whether a local skill or tool already fits this task.');
  hints.push('If a local skill or tool can do the work, use it proactively instead of stopping at manual instructions.');

  if (needsMultiStepHints) {
    hints.push('For multi-step work, continue with the relevant skills and tools until the task is actually complete.');
  }

  if (needsBrowserHints) {
    hints.push('For browser, web, app, and UI tasks, prefer browser automation over pure text instructions.');
    hints.push('Preferred browser flow: start/open or navigate -> snapshot or screenshot -> act.');
    hints.push('When visual state matters, capture a snapshot or screenshot before concluding.');
  }

  if (needsImageHints) {
    hints.push('Image attachments are present. Use the current attached image content directly before answering.');
    hints.push('Do not search the workspace for unrelated older images unless the user explicitly asks for that.');
  }

  return hints;
}

export function appendDispatchHints(
  text: string,
  attachments?: Array<DispatchAttachmentLike> | null,
): string {
  const trimmed = text.trim();
  if (trimmed.includes(DISPATCH_HINT_START)) {
    return trimmed;
  }

  const hints = buildDispatchHints(trimmed, attachments);
  if (hints.length === 0) {
    return trimmed;
  }

  const block = [
    DISPATCH_HINT_START,
    ...hints.map((hint) => `- ${hint}`),
    DISPATCH_HINT_END,
  ].join('\n');

  return trimmed ? `${trimmed}\n\n${block}` : block;
}

export function stripDispatchHints(text: string): string {
  return text
    .replace(/\s*\[KTCLAW_DISPATCH_HINTS\][\s\S]*?\[\/KTCLAW_DISPATCH_HINTS\]\s*/g, '\n')
    .trim();
}

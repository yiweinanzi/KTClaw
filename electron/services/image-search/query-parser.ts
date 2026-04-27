export type ImageSearchTimeSource = 'file-time';
export type ImageSearchKind = 'image' | 'photo' | 'screenshot';

export interface ImageSearchTimeRange {
  label: string;
  source: ImageSearchTimeSource;
  start: string;
  end: string;
}

export interface ParsedImageSearchQuery {
  originalQuery: string;
  normalizedQuery: string;
  timeRange: ImageSearchTimeRange | null;
  imageKind: ImageSearchKind;
  contentQuery: string;
  contentTerms: string[];
}

export interface ParseImageSearchQueryOptions {
  now?: Date;
}

const IMAGE_WORDS = [
  '图片',
  '图像',
  '照片',
  '相片',
  'photo',
  'photos',
  'picture',
  'pictures',
  'image',
  'images',
];

const FILLER_WORDS = [
  '创建的',
  '创建',
  '修改的',
  '修改',
  '拍摄的',
  '拍摄',
  '拍的',
  '拍',
  '生成的',
  '生成',
  '保存的',
  '保存',
  '文件',
  '的',
  '在',
  '于',
  '里',
  '中',
  'of',
  'from',
  'created',
  'modified',
  'taken',
  'saved',
];

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function makeRange(label: string, start: Date, end: Date): ImageSearchTimeRange {
  return {
    label,
    source: 'file-time',
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function findTimeRange(query: string, now: Date): { range: ImageSearchTimeRange | null; residue: string } {
  const today = startOfLocalDay(now);
  const normalized = query.trim();

  if (/(昨天|yesterday)/i.test(normalized)) {
    return {
      range: makeRange('昨天', addDays(today, -1), today),
      residue: normalized.replace(/昨天|yesterday/gi, ' '),
    };
  }

  if (/(前天)/i.test(normalized)) {
    const start = addDays(today, -2);
    return {
      range: makeRange('前天', start, addDays(start, 1)),
      residue: normalized.replace(/前天/gi, ' '),
    };
  }

  if (/(今天|today)/i.test(normalized)) {
    return {
      range: makeRange('今天', today, addDays(today, 1)),
      residue: normalized.replace(/今天|today/gi, ' '),
    };
  }

  if (/(上周末|上个周末|last\s+weekend)/i.test(normalized)) {
    const day = today.getDay();
    const daysSinceSaturday = (day + 1) % 7 || 7;
    const start = addDays(today, -daysSinceSaturday);
    return {
      range: makeRange('上周末', start, addDays(start, 2)),
      residue: normalized.replace(/上周末|上个周末|last\s+weekend/gi, ' '),
    };
  }

  if (/(上月|上个月|last\s+month)/i.test(normalized)) {
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const start = addMonths(thisMonth, -1);
    return {
      range: makeRange('上月', start, thisMonth),
      residue: normalized.replace(/上月|上个月|last\s+month/gi, ' '),
    };
  }

  const recentDays = normalized.match(/最近\s*([一二两三四五六七八九十\d]+)\s*天/);
  if (recentDays?.[1]) {
    const days = parseChineseSmallNumber(recentDays[1]);
    if (days > 0) {
      return {
        range: makeRange(`最近${days}天`, addDays(today, -(days - 1)), addDays(today, 1)),
        residue: normalized.replace(/最近\s*[一二两三四五六七八九十\d]+\s*天/g, ' '),
      };
    }
  }

  return { range: null, residue: normalized };
}

function parseChineseSmallNumber(raw: string): number {
  const trimmed = raw.trim();
  const direct = Number(trimmed);
  if (Number.isFinite(direct)) return direct;
  const map: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (trimmed === '十') return 10;
  if (trimmed.startsWith('十')) return 10 + (map[trimmed.slice(1)] ?? 0);
  if (trimmed.endsWith('十')) return (map[trimmed.slice(0, -1)] ?? 0) * 10;
  if (trimmed.includes('十')) {
    const [tens, ones] = trimmed.split('十');
    return (map[tens] ?? 0) * 10 + (map[ones] ?? 0);
  }
  return map[trimmed] ?? 0;
}

function detectImageKind(query: string): ImageSearchKind {
  if (/截图|截屏|screenshot|screen\s*shot/i.test(query)) {
    return 'screenshot';
  }
  if (/照片|相片|photo/i.test(query)) {
    return 'photo';
  }
  return 'image';
}

function buildContentQuery(residue: string): string {
  let content = residue;
  for (const word of [...IMAGE_WORDS, ...FILLER_WORDS]) {
    content = content.replace(new RegExp(escapeRegExp(word), 'gi'), ' ');
  }
  content = content.replace(/截图|截屏|screenshot|screen\s*shot/gi, ' ');
  return content.replace(/[，。,.!?？、:：;；()[\]{}"'`~|\\/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenizeContent(content: string): string[] {
  if (!content) return [];
  const matches = content.match(/[\p{Script=Han}]+|[a-zA-Z0-9_-]+/gu) ?? [];
  return [...new Set(matches.map((item) => item.trim()).filter(Boolean))];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseImageSearchQuery(
  query: string,
  options: ParseImageSearchQueryOptions = {},
): ParsedImageSearchQuery {
  const originalQuery = String(query ?? '');
  const normalizedQuery = originalQuery.replace(/\s+/g, ' ').trim();
  const now = options.now ?? new Date();
  const { range, residue } = findTimeRange(normalizedQuery, now);
  const imageKind = detectImageKind(normalizedQuery);
  const contentQuery = buildContentQuery(residue);

  return {
    originalQuery,
    normalizedQuery,
    timeRange: range,
    imageKind,
    contentQuery,
    contentTerms: tokenizeContent(contentQuery),
  };
}

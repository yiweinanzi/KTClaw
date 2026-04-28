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
  '请帮我',
  '帮我',
  '帮忙',
  '给我',
  '搜一下',
  '搜图',
  '搜索',
  '查找',
  '查一下',
  '寻找',
  '找一下',
  '找',
  '搜',
  '查',
  '一张',
  '一幅',
  '一个',
  '一些',
  '几张',
  '有关',
  '关于',
  '相关',
  '里面',
  '包含',
  '含有',
  '带有',
  '显示',
  '一下',
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

function addYears(date: Date, years: number): Date {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function getMonday(date: Date): Date {
  const day = date.getDay(); // 0=Sunday, 1=Monday, ...6=Saturday
  return addDays(date, -(day === 0 ? 6 : day - 1));
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

  // 上周末 is already handled above; now handle 上周 (but NOT 上周末)
  if (/(上周|上个星期|last\s+week)(?!末)/i.test(normalized)) {
    const thisMonday = getMonday(today);
    const lastMonday = addDays(thisMonday, -7);
    return {
      range: makeRange('上周', lastMonday, thisMonday),
      residue: normalized.replace(/(上周|上个星期|last\s+week)(?!末)/gi, ' '),
    };
  }

  if (/(本周|这周|这个星期|this\s+week)/i.test(normalized)) {
    const thisMonday = getMonday(today);
    const nextMonday = addDays(thisMonday, 7);
    return {
      range: makeRange('本周', thisMonday, nextMonday),
      residue: normalized.replace(/本周|这周|这个星期|this\s+week/gi, ' '),
    };
  }

  if (/(去年|last\s+year)/i.test(normalized)) {
    const startOfLastYear = new Date(today.getFullYear() - 1, 0, 1);
    const startOfThisYear = new Date(today.getFullYear(), 0, 1);
    return {
      range: makeRange('去年', startOfLastYear, startOfThisYear),
      residue: normalized.replace(/去年|last\s+year/gi, ' '),
    };
  }

  if (/(今年|this\s+year)/i.test(normalized)) {
    const startOfThisYear = new Date(today.getFullYear(), 0, 1);
    const startOfNextYear = new Date(today.getFullYear() + 1, 0, 1);
    return {
      range: makeRange('今年', startOfThisYear, startOfNextYear),
      residue: normalized.replace(/今年|this\s+year/gi, ' '),
    };
  }

  const recentWeeks = normalized.match(/最近\s*([一二两三四五六七八九十\d]+)\s*(?:个)?(?:星期|周)/);
  if (recentWeeks?.[1]) {
    const weeks = parseChineseSmallNumber(recentWeeks[1]);
    if (weeks > 0) {
      return {
        range: makeRange(`最近${weeks}周`, addDays(today, -(weeks * 7)), addDays(today, 1)),
        residue: normalized.replace(/最近\s*[一二两三四五六七八九十\d]+\s*(?:个)?(?:星期|周)/g, ' '),
      };
    }
  }

  const recentMonths = normalized.match(/最近\s*([一二两三四五六七八九十\d]+)\s*(?:个)?月/);
  if (recentMonths?.[1]) {
    const months = parseChineseSmallNumber(recentMonths[1]);
    if (months > 0) {
      return {
        range: makeRange(`最近${months}月`, addMonths(today, -months), addDays(today, 1)),
        residue: normalized.replace(/最近\s*[一二两三四五六七八九十\d]+\s*(?:个)?月/g, ' '),
      };
    }
  }

  // Seasons — resolve to the most recent completed or current instance of the season
  if (/(春天|春季|spring)/i.test(normalized)) {
    // Spring: Mar 1 - Jun 1
    const springStart = new Date(today.getFullYear(), 2, 1); // Mar 1
    const springEnd = new Date(today.getFullYear(), 5, 1);   // Jun 1
    // If spring hasn't started yet this year (before Mar 1), use last year's spring
    const start = today < springStart ? new Date(today.getFullYear() - 1, 2, 1) : springStart;
    const end = today < springStart ? new Date(today.getFullYear() - 1, 5, 1) : springEnd;
    return {
      range: makeRange('春天', start, end),
      residue: normalized.replace(/春天|春季|spring/gi, ' '),
    };
  }

  if (/(夏天|夏季|summer)/i.test(normalized)) {
    // Summer: Jun 1 - Sep 1
    const summerStart = new Date(today.getFullYear(), 5, 1); // Jun 1
    const summerEnd = new Date(today.getFullYear(), 8, 1);   // Sep 1
    const start = today < summerStart ? new Date(today.getFullYear() - 1, 5, 1) : summerStart;
    const end = today < summerStart ? new Date(today.getFullYear() - 1, 8, 1) : summerEnd;
    return {
      range: makeRange('夏天', start, end),
      residue: normalized.replace(/夏天|夏季|summer/gi, ' '),
    };
  }

  if (/(秋天|秋季|fall|autumn)/i.test(normalized)) {
    // Fall: Sep 1 - Dec 1
    const fallStart = new Date(today.getFullYear(), 8, 1);  // Sep 1
    const fallEnd = new Date(today.getFullYear(), 11, 1);   // Dec 1
    const start = today < fallStart ? new Date(today.getFullYear() - 1, 8, 1) : fallStart;
    const end = today < fallStart ? new Date(today.getFullYear() - 1, 11, 1) : fallEnd;
    return {
      range: makeRange('秋天', start, end),
      residue: normalized.replace(/秋天|秋季|fall|autumn/gi, ' '),
    };
  }

  if (/(冬天|冬季|winter)/i.test(normalized)) {
    // Winter: Dec 1 - Mar 1 (crosses year boundary)
    // For a date in spring/summer/fall of year Y, last winter was Dec (Y-1) - Mar Y
    // For a date in winter (Dec of year Y), winter is Dec Y - Mar (Y+1)
    const winterStartThisYear = new Date(today.getFullYear(), 11, 1); // Dec 1 this year
    let winterStart: Date;
    let winterEnd: Date;
    if (today >= winterStartThisYear) {
      // We are in Dec — winter started this Dec
      winterStart = winterStartThisYear;
      winterEnd = new Date(today.getFullYear() + 1, 2, 1); // Mar 1 next year
    } else {
      // Winter hasn't started yet this year — use last winter: Dec (Y-1) to Mar Y
      winterStart = new Date(today.getFullYear() - 1, 11, 1);
      winterEnd = new Date(today.getFullYear(), 2, 1);
    }
    return {
      range: makeRange('冬天', winterStart, winterEnd),
      residue: normalized.replace(/冬天|冬季|winter/gi, ' '),
    };
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

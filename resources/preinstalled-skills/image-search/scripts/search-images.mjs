#!/usr/bin/env node
import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.heic', '.heif']);
const TERM_SYNONYMS = {
  猫: ['cat', 'kitty', 'kitten'],
  海边: ['beach', 'sea', 'ocean', 'coast', 'shore', 'seaside'],
  会议: ['meeting', 'conference', 'sync', 'standup'],
  截图: ['screenshot', 'screen shot', 'screen-shot', 'screen_capture', 'snapshot'],
};

function parseArgs(argv) {
  const out = { roots: [], query: '', limit: 50, json: false, now: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') out.roots.push(argv[++index] || '');
    else if (arg === '--query') out.query = argv[++index] || '';
    else if (arg === '--limit') out.limit = Number(argv[++index] || '50');
    else if (arg === '--now') out.now = argv[++index] || undefined;
    else if (arg === '--json') out.json = true;
  }
  out.roots = out.roots.map((root) => root.trim()).filter(Boolean);
  out.query = out.query.trim();
  out.limit = Number.isFinite(out.limit) ? Math.max(1, Math.min(200, Math.floor(out.limit))) : 50;
  return out;
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function makeRange(label, start, end) {
  return { label, source: 'file-time', start: start.toISOString(), end: end.toISOString() };
}

function parseSmallNumber(raw) {
  const direct = Number(raw.trim());
  if (Number.isFinite(direct)) return direct;
  const map = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const value = raw.trim();
  if (value === '十') return 10;
  if (value.startsWith('十')) return 10 + (map[value.slice(1)] || 0);
  if (value.endsWith('十')) return (map[value.slice(0, -1)] || 0) * 10;
  if (value.includes('十')) {
    const [tens, ones] = value.split('十');
    return (map[tens] || 0) * 10 + (map[ones] || 0);
  }
  return map[value] || 0;
}

function findTimeRange(query, now) {
  const today = startOfLocalDay(now);
  if (/(昨天|yesterday)/i.test(query)) return { range: makeRange('昨天', addDays(today, -1), today), residue: query.replace(/昨天|yesterday/gi, ' ') };
  if (/(前天)/i.test(query)) {
    const start = addDays(today, -2);
    return { range: makeRange('前天', start, addDays(start, 1)), residue: query.replace(/前天/gi, ' ') };
  }
  if (/(今天|today)/i.test(query)) return { range: makeRange('今天', today, addDays(today, 1)), residue: query.replace(/今天|today/gi, ' ') };
  if (/(上周末|上个周末|last\s+weekend)/i.test(query)) {
    const daysSinceSaturday = (today.getDay() + 1) % 7 || 7;
    const start = addDays(today, -daysSinceSaturday);
    return { range: makeRange('上周末', start, addDays(start, 2)), residue: query.replace(/上周末|上个周末|last\s+weekend/gi, ' ') };
  }
  if (/(上月|上个月|last\s+month)/i.test(query)) {
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return { range: makeRange('上月', addMonths(thisMonth, -1), thisMonth), residue: query.replace(/上月|上个月|last\s+month/gi, ' ') };
  }
  const recentDays = query.match(/最近\s*([一二两三四五六七八九十\d]+)\s*天/);
  if (recentDays?.[1]) {
    const days = parseSmallNumber(recentDays[1]);
    if (days > 0) return { range: makeRange(`最近${days}天`, addDays(today, -(days - 1)), addDays(today, 1)), residue: query.replace(/最近\s*[一二两三四五六七八九十\d]+\s*天/g, ' ') };
  }
  return { range: null, residue: query };
}

function parseQuery(query, now) {
  const normalizedQuery = query.replace(/\s+/g, ' ').trim();
  const { range, residue } = findTimeRange(normalizedQuery, now);
  const imageKind = /截图|截屏|screenshot|screen\s*shot/i.test(normalizedQuery)
    ? 'screenshot'
    : (/照片|相片|photo/i.test(normalizedQuery) ? 'photo' : 'image');
  let content = residue;
  const fillers = ['图片', '图像', '照片', '相片', 'photo', 'photos', 'picture', 'pictures', 'image', 'images', '创建的', '创建', '修改的', '修改', '拍摄的', '拍摄', '拍的', '拍', '生成的', '生成', '保存的', '保存', '文件', '的', '在', '于', '里', '中', '截图', '截屏', 'of', 'from', 'created', 'modified', 'taken', 'saved'];
  for (const word of fillers) content = content.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  content = content.replace(/[，。,.!?？、:：;；()[\]{}"'`~|\\/]+/g, ' ').replace(/\s+/g, ' ').trim();
  const contentTerms = [...new Set(content.match(/[\p{Script=Han}]+|[a-zA-Z0-9_-]+/gu) || [])];
  return { originalQuery: query, normalizedQuery, timeRange: range, imageKind, contentQuery: content, contentTerms };
}

function normalizeText(value) {
  return value.toLowerCase().replace(/[_-]+/g, ' ');
}

function scorePath(filePath, parsed) {
  if (parsed.contentTerms.length === 0) return { score: 1, matchedTerms: [], reasons: ['time'] };
  const text = normalizeText(filePath);
  const matchedTerms = [];
  const reasons = [];
  let score = 0;
  for (const term of parsed.contentTerms) {
    const candidates = [term, ...(TERM_SYNONYMS[term] || [])];
    if (candidates.some((candidate) => text.includes(normalizeText(candidate)))) {
      matchedTerms.push(term);
      reasons.push(`content:${term}`);
      score += 10;
    }
  }
  if (parsed.imageKind === 'screenshot' && ['截图', ...TERM_SYNONYMS.截图].some((candidate) => text.includes(normalizeText(candidate)))) {
    score += 4;
    reasons.push('kind:screenshot');
  }
  return { score, matchedTerms, reasons };
}

async function* walkImages(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const filePath = join(root, entry.name);
    if (entry.isDirectory()) yield* walkImages(filePath);
    else if (entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) yield filePath;
  }
}

async function searchImages({ roots, query, now, limit }) {
  const parsed = parseQuery(query, now);
  const normalizedRoots = [...new Set(roots.map((root) => resolve(root)))];
  const results = [];
  let totalScanned = 0;
  let totalMatched = 0;
  for (const root of normalizedRoots) {
    for await (const filePath of walkImages(root)) {
      totalScanned += 1;
      const fileStat = await stat(filePath).catch(() => null);
      if (!fileStat?.isFile()) continue;
      if (parsed.timeRange) {
        const start = Date.parse(parsed.timeRange.start);
        const end = Date.parse(parsed.timeRange.end);
        if (fileStat.mtimeMs < start || fileStat.mtimeMs >= end) continue;
      }
      const match = scorePath(filePath, parsed);
      if (parsed.contentTerms.length > 0 && match.score <= 0) continue;
      totalMatched += 1;
      results.push({
        path: filePath,
        fileName: basename(filePath),
        extension: extname(filePath).toLowerCase(),
        sizeBytes: fileStat.size,
        createdAt: fileStat.birthtime.toISOString(),
        modifiedAt: fileStat.mtime.toISOString(),
        fileTime: fileStat.mtime.toISOString(),
        match,
      });
    }
  }
  results.sort((a, b) => b.match.score - a.match.score || Date.parse(b.fileTime) - Date.parse(a.fileTime));
  return { parsed, roots: normalizedRoots, totalScanned, totalMatched, results: results.slice(0, limit) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.query || args.roots.length === 0) {
    console.error('Usage: search-images.mjs --root <directory> --query "<query>" [--limit 50] [--json]');
    process.exitCode = 2;
    return;
  }
  const now = args.now ? new Date(args.now) : new Date();
  const result = await searchImages({ roots: args.roots, query: args.query, now, limit: args.limit });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  for (const entry of result.results) {
    console.log(`${entry.path}\t${entry.match.reasons.join(',')}`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, join, relative, resolve } from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.heic', '.heif']);
const MOBILECLIP_MODEL_ID = 'Xenova/mobileclip_s0';
const DEFAULT_REMOTE_PATH_TEMPLATE = '{model}/resolve/{revision}/';
const SEMANTIC_SCORE_SCALE = 10;
const SEMANTIC_MIN_SIMILARITY = 0.2;
const TERM_SYNONYMS = {
  猫: ['cat', 'kitty', 'kitten'],
  企鹅: ['penguin', 'penguins'],
  海边: ['beach', 'sea', 'ocean', 'coast', 'shore', 'seaside'],
  会议: ['meeting', 'conference', 'sync', 'standup'],
  截图: ['screenshot', 'screen shot', 'screen-shot', 'screen_capture', 'snapshot'],
};

function parseArgs(argv) {
  const out = { roots: [], query: '', limit: 50, json: false, now: undefined, status: false, similarTo: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') out.roots.push(argv[++index] || '');
    else if (arg === '--query') out.query = argv[++index] || '';
    else if (arg === '--limit') out.limit = Number(argv[++index] || '50');
    else if (arg === '--now') out.now = argv[++index] || undefined;
    else if (arg === '--status') out.status = true;
    else if (arg === '--similar-to') out.similarTo = argv[++index] || undefined;
    else if (arg === '--json') out.json = true;
    // --semantic is deprecated and silently ignored (semantic is always on)
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
  const fillers = ['图片', '图像', '照片', '相片', 'photo', 'photos', 'picture', 'pictures', 'image', 'images', '请帮我', '帮我', '帮忙', '给我', '搜一下', '搜图', '搜索', '查找', '查一下', '寻找', '找一下', '找', '搜', '查', '一张', '一幅', '一个', '一些', '几张', '有关', '关于', '相关', '里面', '包含', '含有', '带有', '显示', '一下', '创建的', '创建', '修改的', '修改', '拍摄的', '拍摄', '拍的', '拍', '生成的', '生成', '保存的', '保存', '文件', '的', '在', '于', '里', '中', '截图', '截屏', 'of', 'from', 'created', 'modified', 'taken', 'saved'];
  for (const word of fillers) content = content.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  content = content.replace(/[，。,.!?？、:：;；()[\]{}\"'`~|\\/]+/g, ' ').replace(/\s+/g, ' ').trim();
  const contentTerms = [...new Set(content.match(/[\p{Script=Han}]+|[a-zA-Z0-9_-]+/gu) || [])];
  return { originalQuery: query, normalizedQuery, timeRange: range, imageKind, contentQuery: content, contentTerms };
}

function normalizeText(value) {
  return value.toLowerCase().replace(/[_-]+/g, ' ');
}

function scorePath(filePath, parsed, root) {
  if (parsed.contentTerms.length === 0) return { score: 1, matchedTerms: [], reasons: ['time'] };
  const searchPath = root ? relative(root, filePath) || basename(filePath) : filePath;
  const text = normalizeText(searchPath);
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

function cosineSimilarity(a, b) {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    aNorm += a[index] * a[index];
    bNorm += b[index] * b[index];
  }
  if (aNorm <= 0 || bNorm <= 0) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

function mergeSemanticMatch(base, parsed, similarity) {
  if (similarity < SEMANTIC_MIN_SIMILARITY) return base;
  const matchedTerms = new Set(base.matchedTerms);
  for (const term of parsed.contentTerms) matchedTerms.add(term);
  return {
    score: base.score + similarity * SEMANTIC_SCORE_SCALE,
    matchedTerms: [...matchedTerms],
    reasons: [...base.reasons, `semantic:${parsed.contentQuery || parsed.normalizedQuery}`],
  };
}

function tensorToVector(tensor) {
  return Array.from(tensor.data, Number);
}

function toMobileClipPrompt(text) {
  const normalized = text.trim().toLowerCase();
  const dictionary = [
    [/企鹅/g, 'penguin'],
    [/猫|小猫/g, 'cat'],
    [/狗|小狗/g, 'dog'],
    [/海边|海滩|沙滩/g, 'beach'],
    [/夕阳|日落|落日/g, 'sunset'],
    [/会议/g, 'meeting'],
    [/截图|截屏/g, 'screenshot'],
    [/人像|人物|人/g, 'person'],
    [/小孩|孩子/g, 'child'],
    [/天空/g, 'sky'],
    [/雪/g, 'snow'],
    [/山/g, 'mountain'],
    [/花/g, 'flower'],
    [/车|汽车/g, 'car'],
    [/建筑|楼/g, 'building'],
    [/食物|美食/g, 'food'],
  ];
  let translated = normalized;
  for (const [pattern, replacement] of dictionary) {
    translated = translated.replace(pattern, ` ${replacement} `);
  }
  translated = translated.replace(/\s+/g, ' ').trim();
  if (!translated) return normalized;
  if (/^(a|an|the)\s+/.test(translated) || translated.includes('photo of')) return translated;
  return `a photo of ${translated}`;
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function getModelCacheDir() {
  return process.env.KTCLAW_IMAGE_SEARCH_MODEL_CACHE
    || join(homedir(), '.ktclaw', 'image-search-models');
}

function getLocalModelPath() {
  return process.env.KTCLAW_IMAGE_SEARCH_LOCAL_MODEL_PATH?.trim() || null;
}

function hasCachedModel(cacheDir = getModelCacheDir()) {
  const modelRoot = join(cacheDir, ...MOBILECLIP_MODEL_ID.split('/'));
  return [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'preprocessor_config.json',
    join('onnx', 'text_model_quantized.onnx'),
    join('onnx', 'vision_model_quantized.onnx'),
  ].every((relativePath) => existsSync(join(modelRoot, relativePath)));
}

function getRemoteModelSources() {
  const customHost = process.env.KTCLAW_IMAGE_SEARCH_MODEL_REMOTE_HOST?.trim();
  if (customHost) {
    return [{
      name: 'custom',
      modelId: MOBILECLIP_MODEL_ID,
      remoteHost: ensureTrailingSlash(customHost),
      remotePathTemplate: process.env.KTCLAW_IMAGE_SEARCH_MODEL_REMOTE_PATH_TEMPLATE?.trim() || DEFAULT_REMOTE_PATH_TEMPLATE,
      revision: process.env.KTCLAW_IMAGE_SEARCH_MODEL_REVISION?.trim() || 'main',
    }];
  }

  const allSources = {
    modelscope: {
      name: 'modelscope',
      modelId: MOBILECLIP_MODEL_ID,
      remoteHost: 'https://www.modelscope.cn/models/',
      remotePathTemplate: DEFAULT_REMOTE_PATH_TEMPLATE,
      revision: 'master',
    },
    'hf-mirror': {
      name: 'hf-mirror',
      modelId: MOBILECLIP_MODEL_ID,
      remoteHost: 'https://hf-mirror.com/',
      remotePathTemplate: DEFAULT_REMOTE_PATH_TEMPLATE,
      revision: 'main',
    },
    huggingface: {
      name: 'huggingface',
      modelId: MOBILECLIP_MODEL_ID,
      remoteHost: 'https://huggingface.co/',
      remotePathTemplate: DEFAULT_REMOTE_PATH_TEMPLATE,
      revision: 'main',
    },
  };

  const configuredSource = process.env.KTCLAW_IMAGE_SEARCH_MODEL_SOURCE?.trim().toLowerCase();
  if (configuredSource && configuredSource !== 'auto') {
    return allSources[configuredSource]
      ? [allSources[configuredSource]]
      : [allSources.modelscope, allSources['hf-mirror'], allSources.huggingface];
  }

  const sources = [allSources.modelscope];
  const hfEndpoint = process.env.KTCLAW_IMAGE_SEARCH_HF_ENDPOINT?.trim() || process.env.HF_ENDPOINT?.trim();
  if (hfEndpoint) {
    sources.push({
      name: 'hf-endpoint',
      modelId: MOBILECLIP_MODEL_ID,
      remoteHost: ensureTrailingSlash(hfEndpoint),
      remotePathTemplate: DEFAULT_REMOTE_PATH_TEMPLATE,
      revision: 'main',
    });
  }
  sources.push(allSources['hf-mirror'], allSources.huggingface);
  return sources;
}

function getStandaloneModelSources() {
  const localModelPath = getLocalModelPath();
  const sources = localModelPath
    ? [{ name: 'local', modelId: MOBILECLIP_MODEL_ID, localModelPath }]
    : [];
  if (!localModelPath && hasCachedModel()) {
    sources.push({ name: 'cache', modelId: MOBILECLIP_MODEL_ID });
  }
  if (process.env.KTCLAW_IMAGE_SEARCH_ALLOW_REMOTE_MODELS === '1') {
    sources.push(...getRemoteModelSources());
  }
  return sources;
}

function configureTransformersSource(transformers, source) {
  transformers.env.allowLocalModels = true;
  if (source.name === 'local') {
    transformers.env.localModelPath = source.localModelPath;
    transformers.env.allowRemoteModels = false;
    return;
  }
  if (source.name === 'cache') {
    transformers.env.allowRemoteModels = false;
    return;
  }

  transformers.env.allowRemoteModels = true;
  transformers.env.remoteHost = source.remoteHost;
  transformers.env.remotePathTemplate = source.remotePathTemplate;
}

function getLoadOptions(source) {
  return source.name === 'local' || source.name === 'cache' ? {} : { revision: source.revision };
}

async function loadSemanticProvider() {
  // Use @huggingface/transformers (D-13: upgraded from @xenova/transformers)
  const transformers = await import('@huggingface/transformers');
  transformers.env.cacheDir = getModelCacheDir();
  const sources = getStandaloneModelSources();
  if (sources.length === 0) {
    throw new Error('MobileCLIP model is not installed. Set KTCLAW_IMAGE_SEARCH_ALLOW_REMOTE_MODELS=1 to allow download, or provide KTCLAW_IMAGE_SEARCH_LOCAL_MODEL_PATH.');
  }

  let loaded = null;
  let lastError = null;
  for (const source of sources) {
    try {
      configureTransformersSource(transformers, source);
      const loadOptions = getLoadOptions(source);
      const [tokenizer, processor, textModel, visionModel] = await Promise.all([
        transformers.AutoTokenizer.from_pretrained(source.modelId, loadOptions),
        transformers.AutoProcessor.from_pretrained(source.modelId, loadOptions),
        transformers.CLIPTextModelWithProjection.from_pretrained(source.modelId, { ...loadOptions, quantized: true }),
        transformers.CLIPVisionModelWithProjection.from_pretrained(source.modelId, { ...loadOptions, quantized: true }),
      ]);
      loaded = { tokenizer, processor, textModel, visionModel };
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!loaded) throw lastError || new Error('Unable to load MobileCLIP semantic model');

  const imageCache = new Map();
  return {
    async embedText(text) {
      const inputs = loaded.tokenizer([toMobileClipPrompt(text)], { padding: 'max_length', truncation: true });
      const output = await loaded.textModel(inputs);
      return tensorToVector(output.text_embeds);
    },
    async embedImage(filePath) {
      const cached = imageCache.get(filePath);
      if (cached) return cached;
      const image = await transformers.RawImage.read(filePath);
      const inputs = await loaded.processor(image);
      const output = await loaded.visionModel(inputs);
      const embedding = tensorToVector(output.image_embeds);
      imageCache.set(filePath, embedding);
      return embedding;
    },
  };
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

async function searchImagesStandalone({ roots, query, now, limit, similarTo }) {
  const parsed = parseQuery(query, now);
  const normalizedRoots = [...new Set(roots.map((root) => resolve(root)))];
  const results = [];
  let semanticError;
  const semanticProvider = parsed.contentQuery || similarTo
    ? await loadSemanticProvider().catch((error) => {
      semanticError = error instanceof Error ? error.message : String(error);
      return null;
    })
    : null;
  const semanticTextEmbedding = semanticProvider && parsed.contentQuery ? await semanticProvider.embedText(parsed.contentQuery) : null;
  const similarToEmbedding = semanticProvider && similarTo ? await semanticProvider.embedImage(similarTo).catch(() => null) : null;
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
      let match = scorePath(filePath, parsed, root);
      if (semanticProvider) {
        const imageEmbedding = await semanticProvider.embedImage(filePath).catch(() => null);
        if (imageEmbedding) {
          if (semanticTextEmbedding) {
            match = mergeSemanticMatch(match, parsed, cosineSimilarity(semanticTextEmbedding, imageEmbedding));
          }
          if (similarToEmbedding) {
            const sim = cosineSimilarity(similarToEmbedding, imageEmbedding);
            if (sim >= SEMANTIC_MIN_SIMILARITY) {
              match = {
                score: match.score + sim * SEMANTIC_SCORE_SCALE,
                matchedTerms: match.matchedTerms,
                reasons: [...match.reasons, `similar-to:${sim.toFixed(3)}`],
              };
            }
          }
        }
      }
      if (parsed.contentTerms.length > 0 && !similarTo && match.score <= 0) continue;
      if (similarTo && match.score <= 0) continue;
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
  return {
    parsed,
    roots: normalizedRoots,
    totalScanned,
    totalMatched,
    semantic: {
      requested: true,
      enabled: Boolean(semanticProvider),
      model: semanticProvider ? MOBILECLIP_MODEL_ID : null,
      ...(semanticError ? { error: semanticError } : {}),
    },
    results: results.slice(0, limit),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const hostApiPort = process.env.KTCLAW_HOST_API_PORT?.trim();

  // --status: check index status via Host API or print standalone message
  if (args.status) {
    if (hostApiPort) {
      try {
        const res = await fetch(`http://localhost:${hostApiPort}/api/image-search/index/status`);
        const data = await res.json();
        if (args.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(`Index state: ${data.state}`);
          if (data.progress) {
            console.log(`Progress: ${data.progress.indexed}/${data.progress.total} indexed, ${data.progress.skipped} skipped`);
          }
          if (data.lastIndexedAt) {
            console.log(`Last indexed: ${data.lastIndexedAt}`);
          }
        }
      } catch (err) {
        console.error('Failed to get index status:', err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    } else {
      const statusMsg = { state: 'standalone', message: 'Running without Host API — no persistent index available.' };
      if (args.json) {
        console.log(JSON.stringify(statusMsg, null, 2));
      } else {
        console.log('Running in standalone mode — no persistent index.');
      }
    }
    return;
  }

  if (!args.query && !args.similarTo) {
    console.error('Usage: search-images.mjs --root <directory> (--query "<query>" | --similar-to <path>) [--limit 50] [--status] [--json]');
    process.exitCode = 2;
    return;
  }
  if (args.roots.length === 0) {
    console.error('Error: at least one --root <directory> is required');
    process.exitCode = 2;
    return;
  }

  const now = args.now ? new Date(args.now) : new Date();

  // Use Host API when available (fast vector index search)
  if (hostApiPort) {
    try {
      const body = {
        query: args.query || '',
        roots: args.roots,
        limit: args.limit,
        semantic: true,
        ...(args.similarTo ? { similarTo: args.similarTo } : {}),
        ...(args.now ? { now: args.now } : {}),
      };
      const res = await fetch(`http://localhost:${hostApiPort}/api/image-search/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Host API error ${res.status}: ${errText}`);
      }
      const result = await res.json();
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      for (const entry of (result.results || [])) {
        console.log(`${entry.path}\t${entry.match?.reasons?.join(',') || ''}`);
      }
      return;
    } catch (err) {
      // Fall through to standalone search on Host API failure
      process.stderr.write(`Host API unavailable (${err instanceof Error ? err.message : String(err)}), falling back to standalone search\n`);
    }
  }

  // Standalone fallback: real-time semantic search without Host API
  const result = await searchImagesStandalone({
    roots: args.roots,
    query: args.query,
    now,
    limit: args.limit,
    similarTo: args.similarTo,
  });
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

import { ensureDir } from '../../utils/paths';
import type { ImageSemanticProvider } from './image-search-service';
import {
  getImageSearchModelCacheDir,
  getImageSearchModelSources,
  type ImageSearchModelSource,
} from './model-cache';

export { MOBILECLIP_MODEL_ID } from './model-cache';

type TensorLike = {
  data: ArrayLike<number>;
};

type TransformersModule = typeof import('@xenova/transformers');

type LoadedMobileClip = {
  tokenizer: Awaited<ReturnType<TransformersModule['AutoTokenizer']['from_pretrained']>>;
  processor: Awaited<ReturnType<TransformersModule['AutoProcessor']['from_pretrained']>>;
  textModel: Awaited<ReturnType<TransformersModule['CLIPTextModelWithProjection']['from_pretrained']>>;
  visionModel: Awaited<ReturnType<TransformersModule['CLIPVisionModelWithProjection']['from_pretrained']>>;
  rawImage: TransformersModule['RawImage'];
};

class MobileClipSemanticProvider implements ImageSemanticProvider {
  private readonly imageCache = new Map<string, number[]>();

  constructor(private readonly loaded: LoadedMobileClip) {}

  async embedText(text: string): Promise<number[]> {
    const prompt = toMobileClipPrompt(text);
    const inputs = this.loaded.tokenizer([prompt], {
      padding: 'max_length',
      truncation: true,
    });
    const output = await this.loaded.textModel(inputs);
    return tensorToVector(output.text_embeds as TensorLike);
  }

  async embedImage(filePath: string): Promise<number[]> {
    const cached = this.imageCache.get(filePath);
    if (cached) return cached;

    const image = await this.loaded.rawImage.read(filePath);
    const inputs = await this.loaded.processor(image);
    const output = await this.loaded.visionModel(inputs);
    const embedding = tensorToVector(output.image_embeds as TensorLike);
    this.imageCache.set(filePath, embedding);
    return embedding;
  }
}

let providerPromise: Promise<ImageSemanticProvider> | null = null;

export function getMobileClipSemanticProvider(): Promise<ImageSemanticProvider> {
  providerPromise ??= loadMobileClipSemanticProvider().catch((error) => {
    providerPromise = null;
    throw error;
  });
  return providerPromise;
}

export async function prewarmMobileClipSemanticProvider(): Promise<void> {
  await getMobileClipSemanticProvider();
}

async function loadMobileClipSemanticProvider(): Promise<ImageSemanticProvider> {
  const MODEL_CACHE_DIR = getImageSearchModelCacheDir();
  ensureDir(MODEL_CACHE_DIR);
  const transformers = await import('@xenova/transformers');
  transformers.env.cacheDir = MODEL_CACHE_DIR;

  const sources = getImageSearchModelSources();
  let lastError: unknown;
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

      return new MobileClipSemanticProvider({
        tokenizer,
        processor,
        textModel,
        visionModel,
        rawImage: transformers.RawImage,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to load MobileCLIP semantic model');
}

function configureTransformersSource(transformers: TransformersModule, source: ImageSearchModelSource): void {
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

function getLoadOptions(source: ImageSearchModelSource): { revision?: string } {
  return source.name === 'local' || source.name === 'cache' ? {} : { revision: source.revision };
}

function tensorToVector(tensor: TensorLike): number[] {
  return Array.from(tensor.data, Number);
}

function toMobileClipPrompt(text: string): string {
  const normalized = text.trim().toLowerCase();
  const translated = translateKnownChineseTerms(normalized).trim();
  if (!translated) return normalized;
  if (/^(a|an|the)\s+/.test(translated) || translated.includes('photo of')) {
    return translated;
  }
  return `a photo of ${translated}`;
}

function translateKnownChineseTerms(text: string): string {
  const dictionary: Array<[RegExp, string]> = [
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

  let translated = text;
  for (const [pattern, replacement] of dictionary) {
    translated = translated.replace(pattern, ` ${replacement} `);
  }
  return translated.replace(/\s+/g, ' ').trim();
}

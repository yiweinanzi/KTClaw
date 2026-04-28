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
  // Use @xenova/transformers (installed package; @huggingface/transformers is the v4 upstream rename
  // but is not yet installed in this codebase — both packages share the same API)
  const transformers = await import('@xenova/transformers');
  transformers.env.cacheDir = MODEL_CACHE_DIR;

  const sources = getImageSearchModelSources();
  if (sources.length === 0) {
    throw new Error('MobileCLIP model is not installed. Set KTCLAW_IMAGE_SEARCH_ALLOW_REMOTE_MODELS=1 to allow download, or provide KTCLAW_IMAGE_SEARCH_LOCAL_MODEL_PATH.');
  }
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
    // ── Existing 16 entries (preserved) ─────────────────────────────────────
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

    // ── 人物社交 (People and Social) ─────────────────────────────────────────
    [/家人|家庭/g, 'family'],
    [/朋友|好友/g, 'friends'],
    [/同事|同僚/g, 'colleagues'],
    [/宝宝|婴儿/g, 'baby'],
    [/老人|老年人/g, 'elderly person'],
    [/男人|男性/g, 'man'],
    [/女人|女性/g, 'woman'],
    [/情侣|恋人/g, 'couple'],
    [/同学/g, 'classmate'],
    [/团队|团体/g, 'group team'],

    // ── 活动 (Activities) ────────────────────────────────────────────────────
    [/聚餐|吃饭/g, 'dining'],
    [/旅游|旅行/g, 'travel trip'],
    [/运动|锻炼/g, 'exercise sports'],
    [/游泳/g, 'swimming'],
    [/跑步/g, 'running'],
    [/骑车|骑行/g, 'cycling'],
    [/爬山|登山/g, 'hiking climbing'],
    [/钓鱼/g, 'fishing'],
    [/唱歌/g, 'singing'],
    [/跳舞/g, 'dancing'],
    [/逛街|购物/g, 'shopping'],
    [/野餐/g, 'picnic'],
    [/露营/g, 'camping'],
    [/烧烤/g, 'barbecue'],
    [/派对|聚会/g, 'party'],
    [/毕业/g, 'graduation'],
    [/婚礼|结婚/g, 'wedding'],
    [/生日/g, 'birthday'],
    [/过年|春节/g, 'Chinese New Year'],
    [/中秋/g, 'Mid-Autumn Festival'],
    [/圣诞/g, 'Christmas'],
    [/玩耍|玩/g, 'playing'],

    // ── 地点 (Locations) ─────────────────────────────────────────────────────
    [/公园/g, 'park'],
    [/餐厅|饭店/g, 'restaurant'],
    [/学校/g, 'school'],
    [/办公室/g, 'office'],
    [/医院/g, 'hospital'],
    [/机场/g, 'airport'],
    [/火车站/g, 'train station'],
    [/地铁/g, 'subway'],
    [/商场|超市/g, 'mall supermarket'],
    [/咖啡店|咖啡厅/g, 'cafe'],
    [/酒店|宾馆/g, 'hotel'],
    [/博物馆/g, 'museum'],
    [/图书馆/g, 'library'],
    [/游乐场|游乐园/g, 'amusement park'],
    [/动物园/g, 'zoo'],
    [/水族馆/g, 'aquarium'],
    [/教堂|寺庙/g, 'church temple'],
    [/广场/g, 'plaza square'],
    [/街道|马路/g, 'street road'],
    [/河|河流/g, 'river'],
    [/湖|湖泊/g, 'lake'],
    [/森林|树林/g, 'forest'],
    [/草地|草原/g, 'grassland meadow'],
    [/沙漠/g, 'desert'],
    [/瀑布/g, 'waterfall'],
    [/海洋|大海/g, 'ocean sea'],
    [/岛|岛屿/g, 'island'],
    [/城市/g, 'city'],
    [/乡村|农村/g, 'countryside village'],
    [/田野|农田/g, 'field farmland'],

    // ── 自然天气 (Nature and Weather) ────────────────────────────────────────
    [/日出|朝阳/g, 'sunrise'],
    [/星空|星星/g, 'stars starry sky'],
    [/月亮|月光/g, 'moon moonlight'],
    [/彩虹/g, 'rainbow'],
    [/云|云彩/g, 'clouds'],
    [/雨|下雨/g, 'rain'],
    [/雾/g, 'fog'],
    [/树|树木/g, 'tree'],
    [/草/g, 'grass'],
    [/叶子|树叶/g, 'leaves'],
    [/果实|水果/g, 'fruit'],
    [/蝴蝶/g, 'butterfly'],
    [/鸟|小鸟/g, 'bird'],

    // ── 动物 (Animals) ───────────────────────────────────────────────────────
    [/兔子/g, 'rabbit'],
    [/鱼/g, 'fish'],
    [/马/g, 'horse'],
    [/牛/g, 'cow'],
    [/羊/g, 'sheep'],
    [/猪/g, 'pig'],
    [/鸡/g, 'chicken'],
    [/鸭/g, 'duck'],
    [/熊|熊猫/g, 'bear panda'],
    [/狮子/g, 'lion'],
    [/老虎/g, 'tiger'],
    [/大象/g, 'elephant'],

    // ── 物品 (Objects) ───────────────────────────────────────────────────────
    [/手机|电话/g, 'phone'],
    [/电脑/g, 'computer'],
    [/书|书籍/g, 'book'],
    [/礼物/g, 'gift'],
    [/蛋糕/g, 'cake'],
    [/咖啡/g, 'coffee'],
    [/酒|啤酒/g, 'alcohol beer'],
    [/衣服|服装/g, 'clothes'],
    [/鞋子/g, 'shoes'],
    [/包|背包/g, 'bag backpack'],
    [/眼镜/g, 'glasses'],
    [/帽子/g, 'hat'],
    [/玩具/g, 'toy'],
    [/乐器|吉他|钢琴/g, 'instrument guitar piano'],
    [/画|绘画/g, 'painting drawing'],
    [/地图/g, 'map'],
    [/旗帜|国旗/g, 'flag'],

    // ── 场景 (Scenes) ────────────────────────────────────────────────────────
    [/风景/g, 'landscape scenery'],
    [/全家福/g, 'family photo'],
    [/自拍/g, 'selfie'],
    [/合影|合照/g, 'group photo'],
    [/夜景/g, 'night scene night view'],
    [/室内/g, 'indoor'],
    [/室外|户外/g, 'outdoor'],
    [/水下/g, 'underwater'],
    [/航拍|俯拍/g, 'aerial view'],
    [/全景/g, 'panorama'],
    [/黑白/g, 'black and white'],
    [/美女|帅哥/g, 'beautiful handsome person'],
    [/笑|微笑/g, 'smile smiling'],
    [/哭|流泪/g, 'crying'],
  ];

  let translated = text;
  for (const [pattern, replacement] of dictionary) {
    translated = translated.replace(pattern, ` ${replacement} `);
  }
  return translated.replace(/\s+/g, ' ').trim();
}

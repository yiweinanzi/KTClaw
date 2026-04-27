import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { getDataDir, getResourcesDir } from '../../utils/paths';

export const MOBILECLIP_MODEL_ID = 'Xenova/mobileclip_s0';
const DEFAULT_REMOTE_PATH_TEMPLATE = '{model}/resolve/{revision}/';
const MODELSCOPE_REMOTE_HOST = 'https://www.modelscope.cn/models/';
const HF_MIRROR_REMOTE_HOST = 'https://hf-mirror.com/';
const HUGGINGFACE_REMOTE_HOST = 'https://huggingface.co/';

export interface ImageSearchRemoteModelSource {
  name: 'custom' | 'modelscope' | 'hf-mirror' | 'huggingface' | 'hf-endpoint';
  modelId: string;
  remoteHost: string;
  remotePathTemplate: string;
  revision: string;
}

export interface ImageSearchCachedModelSource {
  name: 'cache';
  modelId: string;
}

export interface ImageSearchLocalModelSource {
  name: 'local';
  modelId: string;
  localModelPath: string;
}

export type ImageSearchModelSource =
  | ImageSearchCachedModelSource
  | ImageSearchLocalModelSource
  | ImageSearchRemoteModelSource;

export function getImageSearchModelCacheDir(): string {
  const configured = process.env.KTCLAW_IMAGE_SEARCH_MODEL_CACHE?.trim();
  if (configured) return configured;
  return join(getDataDir(), 'image-search-models');
}

export function getImageSearchLocalModelPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.KTCLAW_IMAGE_SEARCH_LOCAL_MODEL_PATH?.trim();
  if (configured) return configured;

  const bundledRoot = join(getResourcesDir(), 'image-search-models');
  const bundledConfig = join(bundledRoot, ...MOBILECLIP_MODEL_ID.split('/'), 'config.json');
  return existsSync(bundledConfig) ? bundledRoot : null;
}

export function hasCachedImageSearchModel(cacheDir = getImageSearchModelCacheDir()): boolean {
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

export function getImageSearchRemoteModelSources(env: NodeJS.ProcessEnv = process.env): ImageSearchRemoteModelSource[] {
  const customHost = env.KTCLAW_IMAGE_SEARCH_MODEL_REMOTE_HOST?.trim();
  if (customHost) {
    return [{
      name: 'custom',
      modelId: MOBILECLIP_MODEL_ID,
      remoteHost: ensureTrailingSlash(customHost),
      remotePathTemplate: env.KTCLAW_IMAGE_SEARCH_MODEL_REMOTE_PATH_TEMPLATE?.trim() || DEFAULT_REMOTE_PATH_TEMPLATE,
      revision: env.KTCLAW_IMAGE_SEARCH_MODEL_REVISION?.trim() || 'main',
    }];
  }

  const hfEndpoint = env.KTCLAW_IMAGE_SEARCH_HF_ENDPOINT?.trim() || env.HF_ENDPOINT?.trim();
  const configuredSource = env.KTCLAW_IMAGE_SEARCH_MODEL_SOURCE?.trim().toLowerCase();
  const allSources: Record<string, ImageSearchRemoteModelSource> = {
    modelscope: {
      name: 'modelscope',
      modelId: MOBILECLIP_MODEL_ID,
      remoteHost: MODELSCOPE_REMOTE_HOST,
      remotePathTemplate: DEFAULT_REMOTE_PATH_TEMPLATE,
      revision: 'master',
    },
    'hf-mirror': {
      name: 'hf-mirror',
      modelId: MOBILECLIP_MODEL_ID,
      remoteHost: HF_MIRROR_REMOTE_HOST,
      remotePathTemplate: DEFAULT_REMOTE_PATH_TEMPLATE,
      revision: 'main',
    },
    huggingface: {
      name: 'huggingface',
      modelId: MOBILECLIP_MODEL_ID,
      remoteHost: HUGGINGFACE_REMOTE_HOST,
      remotePathTemplate: DEFAULT_REMOTE_PATH_TEMPLATE,
      revision: 'main',
    },
  };

  if (configuredSource && configuredSource !== 'auto') {
    const selected = allSources[configuredSource];
    return selected ? [selected] : [allSources.modelscope, allSources['hf-mirror'], allSources.huggingface];
  }

  const sources = [allSources.modelscope];
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

export function getImageSearchModelSources(env: NodeJS.ProcessEnv = process.env): ImageSearchModelSource[] {
  const localModelPath = getImageSearchLocalModelPath(env);
  const sources: ImageSearchModelSource[] = localModelPath
    ? [{ name: 'local', modelId: MOBILECLIP_MODEL_ID, localModelPath }]
    : [];
  if (!localModelPath && hasCachedImageSearchModel()) {
    sources.push({ name: 'cache', modelId: MOBILECLIP_MODEL_ID });
  }
  if (env.KTCLAW_IMAGE_SEARCH_ALLOW_REMOTE_MODELS === '1') {
    sources.push(...getImageSearchRemoteModelSources(env));
  }
  return sources;
}

export function getImageSearchModelRuntimeEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const runtimeEnv: Record<string, string> = {
    KTCLAW_IMAGE_SEARCH_MODEL_CACHE: getImageSearchModelCacheDir(),
  };
  const localModelPath = getImageSearchLocalModelPath(env);
  if (localModelPath) {
    runtimeEnv.KTCLAW_IMAGE_SEARCH_LOCAL_MODEL_PATH = localModelPath;
  }
  return runtimeEnv;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

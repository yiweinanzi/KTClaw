import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDataDir: vi.fn(() => join('C:', 'Users', 'test', 'KTClawData')),
  getResourcesDir: vi.fn(() => join('C:', 'Program Files', 'KTClaw', 'resources')),
}));

vi.mock('@electron/utils/paths', () => ({
  getDataDir: () => mocks.getDataDir(),
  getResourcesDir: () => mocks.getResourcesDir(),
}));

describe('image search model cache path', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mocks.getDataDir.mockReturnValue(join('C:', 'Users', 'test', 'KTClawData'));
    mocks.getResourcesDir.mockReturnValue(join('C:', 'Program Files', 'KTClaw', 'resources'));
  });

  it('defaults MobileCLIP cache files to the KTClaw data directory', async () => {
    const { getImageSearchModelCacheDir } = await import('@electron/services/image-search/model-cache');

    expect(getImageSearchModelCacheDir()).toBe(join('C:', 'Users', 'test', 'KTClawData', 'image-search-models'));
  });

  it('allows the MobileCLIP cache directory to be shared through environment configuration', async () => {
    vi.stubEnv('KTCLAW_IMAGE_SEARCH_MODEL_CACHE', join('D:', 'ktclaw-cache', 'models'));
    const { getImageSearchModelCacheDir } = await import('@electron/services/image-search/model-cache');

    expect(getImageSearchModelCacheDir()).toBe(join('D:', 'ktclaw-cache', 'models'));
    expect(mocks.getDataDir).not.toHaveBeenCalled();
  });

  it('loads remote MobileCLIP files from ModelScope before mirror and Hugging Face by default', async () => {
    const { getImageSearchRemoteModelSources } = await import('@electron/services/image-search/model-cache');

    expect(getImageSearchRemoteModelSources().map((source) => ({
      name: source.name,
      host: source.remoteHost,
      revision: source.revision,
    }))).toEqual([
      { name: 'modelscope', host: 'https://www.modelscope.cn/models/', revision: 'master' },
      { name: 'hf-mirror', host: 'https://hf-mirror.com/', revision: 'main' },
      { name: 'huggingface', host: 'https://huggingface.co/', revision: 'main' },
    ]);
  });

  it('does not include remote MobileCLIP sources unless remote download is explicitly enabled', async () => {
    const { getImageSearchModelSources } = await import('@electron/services/image-search/model-cache');

    expect(getImageSearchModelSources()).toEqual([]);

    vi.stubEnv('KTCLAW_IMAGE_SEARCH_ALLOW_REMOTE_MODELS', '1');
    expect(getImageSearchModelSources().map((source) => source.name)).toEqual([
      'modelscope',
      'hf-mirror',
      'huggingface',
    ]);
  });

  it('supports custom remote model hosts for private mirrors or CDNs', async () => {
    vi.stubEnv('KTCLAW_IMAGE_SEARCH_MODEL_REMOTE_HOST', 'https://models.example.test/');
    vi.stubEnv('KTCLAW_IMAGE_SEARCH_MODEL_REMOTE_PATH_TEMPLATE', 'assets/{model}/{revision}/');
    vi.stubEnv('KTCLAW_IMAGE_SEARCH_MODEL_REVISION', 'v1');

    const { getImageSearchRemoteModelSources } = await import('@electron/services/image-search/model-cache');

    expect(getImageSearchRemoteModelSources()).toEqual([
      {
        name: 'custom',
        modelId: 'Xenova/mobileclip_s0',
        remoteHost: 'https://models.example.test/',
        remotePathTemplate: 'assets/{model}/{revision}/',
        revision: 'v1',
      },
    ]);
  });

  it('exports shared runtime env for gateway skill processes', async () => {
    vi.stubEnv('KTCLAW_IMAGE_SEARCH_LOCAL_MODEL_PATH', join('E:', 'offline-models'));
    const { getImageSearchModelRuntimeEnv } = await import('@electron/services/image-search/model-cache');

    expect(getImageSearchModelRuntimeEnv()).toEqual({
      KTCLAW_IMAGE_SEARCH_MODEL_CACHE: join('C:', 'Users', 'test', 'KTClawData', 'image-search-models'),
      KTCLAW_IMAGE_SEARCH_LOCAL_MODEL_PATH: join('E:', 'offline-models'),
    });
  });
});

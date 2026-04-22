import { describe, expect, it } from 'vitest';
import {
  appendDispatchHints,
  resolveImageUnderstandingAvailability,
  stripDispatchHints,
} from '../../shared/chat-dispatch-hints';

describe('chat dispatch hints', () => {
  it('adds browser orchestration hints for browser and screenshot tasks', () => {
    const augmented = appendDispatchHints('Open the browser, inspect the page, and take a screenshot.');

    expect(augmented).toContain('[KTCLAW_DISPATCH_HINTS]');
    expect(augmented).toContain('check whether a local skill or tool already fits this task');
    expect(augmented).toContain('start/open or navigate -> snapshot or screenshot -> act');
  });

  it('adds image understanding hints when image attachments are present', () => {
    const augmented = appendDispatchHints('What is shown in this image?', [
      { mimeType: 'image/png' },
    ]);

    expect(augmented).toContain('[KTCLAW_DISPATCH_HINTS]');
    expect(augmented).toContain('Use the current attached image content directly');
    expect(augmented).toContain('Do not search the workspace for unrelated older images');
  });

  it('removes hidden dispatch hints from stored user text for display', () => {
    const original = 'Use the browser and verify the final UI.';
    const augmented = appendDispatchHints(original);

    expect(stripDispatchHints(augmented)).toBe(original);
  });

  it('reports missing image understanding when only a DeepSeek text account is configured', () => {
    const availability = resolveImageUnderstandingAvailability({
      currentModel: 'deepseek-chat',
      accounts: [
        {
          enabled: true,
          vendorId: 'deepseek',
          model: 'deepseek-chat',
        },
      ],
    });

    expect(availability).toBe('missing');
  });

  it('reports native image understanding when the active model is vision-capable', () => {
    const availability = resolveImageUnderstandingAvailability({
      currentModel: 'anthropic/claude-sonnet-4-6',
      accounts: [],
    });

    expect(availability).toBe('native');
  });

  it('treats unknown local models as vision-capable by default', () => {
    expect(resolveImageUnderstandingAvailability({
      currentModel: 'ollama/gemma3:12b',
      accounts: [],
    })).toBe('native');

    expect(resolveImageUnderstandingAvailability({
      currentModel: 'ollama/minicpm-v:8b',
      accounts: [],
    })).toBe('native');

    expect(resolveImageUnderstandingAvailability({
      currentModel: 'ollama/qwen3.5:9b',
      accounts: [],
    })).toBe('native');

    expect(resolveImageUnderstandingAvailability({
      currentModel: 'some-unknown-model',
      accounts: [],
    })).toBe('native');
  });

  it('reports fallback image understanding when an OpenAI account is available', () => {
    const availability = resolveImageUnderstandingAvailability({
      currentModel: 'deepseek-chat',
      accounts: [
        {
          enabled: true,
          vendorId: 'openai',
          model: 'gpt-5.4',
        },
      ],
    });

    expect(availability).toBe('fallback');
  });

  it('treats any enabled Ollama account as native since all models default to vision-capable', () => {
    const availability = resolveImageUnderstandingAvailability({
      currentModel: 'plain-local-model-name',
      accounts: [
        {
          enabled: true,
          vendorId: 'ollama',
          model: 'qwen3:latest',
        },
      ],
    });

    expect(availability).toBe('native');
  });
});

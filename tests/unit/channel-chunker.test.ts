import { describe, it, expect } from 'vitest';
import { chunkMarkdownText, chunkPlainText } from '@electron/channels/shared/chunker';

describe('chunkPlainText', () => {
  it('returns single-element array when text is under limit', () => {
    expect(chunkPlainText('short text', 4000)).toEqual(['short text']);
  });

  it('returns single-element array for empty string', () => {
    expect(chunkPlainText('', 4000)).toEqual(['']);
  });

  it('splits at newline boundaries when total exceeds limit', () => {
    const line1 = 'a'.repeat(60);
    const line2 = 'b'.repeat(60);
    const text = `${line1}\n${line2}`;
    const chunks = chunkPlainText(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be within limit
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
    // Reassembled content should match original
    expect(chunks.join('\n')).toBe(text);
  });

  it('hard-splits a single line that exceeds limit', () => {
    const longLine = 'x'.repeat(250);
    const chunks = chunkPlainText(longLine, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it('preserves multi-line content across chunks', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}: ${'x'.repeat(20)}`);
    const text = lines.join('\n');
    const chunks = chunkPlainText(text, 80);
    const reassembled = chunks.join('\n');
    expect(reassembled).toBe(text);
  });
});

describe('chunkMarkdownText', () => {
  it('returns single-element array when text is under limit', () => {
    expect(chunkMarkdownText('short text', 4000)).toEqual(['short text']);
  });

  it('returns single-element array for empty string', () => {
    expect(chunkMarkdownText('', 4000)).toEqual(['']);
  });

  it('splits at paragraph boundaries (double newline) when total exceeds limit', () => {
    const para1 = 'a'.repeat(60);
    const para2 = 'b'.repeat(60);
    const text = `${para1}\n\n${para2}`;
    const chunks = chunkMarkdownText(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it('does NOT split inside a fenced code block', () => {
    const codeBlock = '```\n' + 'x'.repeat(200) + '\n```';
    const before = 'Before code.\n\n';
    const after = '\n\nAfter code.';
    const text = before + codeBlock + after;
    const chunks = chunkMarkdownText(text, 100);
    // The code block must appear intact in one chunk
    const codeBlockInChunk = chunks.some(
      (c) => c.includes('```\n') && c.includes('\n```')
    );
    expect(codeBlockInChunk).toBe(true);
  });

  it('splits before headings', () => {
    const intro = 'Introduction text.\n\n';
    const heading = '# Section One\n\nContent here.';
    const text = intro + heading;
    const chunks = chunkMarkdownText(text, intro.length + 5);
    // Should split so heading starts a new chunk
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('falls back to plain splitting for a single paragraph exceeding limit', () => {
    const longPara = 'w'.repeat(300);
    const chunks = chunkMarkdownText(longPara, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it('handles text with multiple paragraphs correctly', () => {
    const paras = Array.from({ length: 5 }, (_, i) => `Paragraph ${i + 1}: ${'y'.repeat(30)}`);
    const text = paras.join('\n\n');
    const chunks = chunkMarkdownText(text, 80);
    // All content should be preserved
    const allContent = chunks.join('\n\n');
    // Each paragraph should appear somewhere in the output
    for (const para of paras) {
      expect(allContent).toContain(para);
    }
  });
});

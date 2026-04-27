import { describe, expect, it } from 'vitest';

import { parseImageSearchQuery } from '@electron/services/image-search/query-parser';

const NOW = new Date('2026-04-27T10:30:00+08:00');

describe('image search query parser', () => {
  it('parses yesterday as a file-time range', () => {
    const parsed = parseImageSearchQuery('昨天的图片', { now: NOW });

    expect(parsed.timeRange).toMatchObject({
      label: '昨天',
      source: 'file-time',
      start: '2026-04-25T16:00:00.000Z',
      end: '2026-04-26T16:00:00.000Z',
    });
    expect(parsed.contentTerms).toEqual([]);
  });

  it('parses previous weekend relative to the current day', () => {
    const parsed = parseImageSearchQuery('上周末在海边拍的照片', { now: NOW });

    expect(parsed.timeRange).toMatchObject({
      label: '上周末',
      source: 'file-time',
      start: '2026-04-24T16:00:00.000Z',
      end: '2026-04-26T16:00:00.000Z',
    });
    expect(parsed.imageKind).toBe('photo');
    expect(parsed.contentQuery).toBe('海边');
    expect(parsed.contentTerms).toEqual(['海边']);
  });

  it('parses previous month as a calendar month range', () => {
    const parsed = parseImageSearchQuery('上月会议截图', { now: NOW });

    expect(parsed.timeRange).toMatchObject({
      label: '上月',
      source: 'file-time',
      start: '2026-02-28T16:00:00.000Z',
      end: '2026-03-31T16:00:00.000Z',
    });
    expect(parsed.imageKind).toBe('screenshot');
    expect(parsed.contentTerms).toEqual(['会议']);
  });

  it('keeps content-only descriptions without a time range', () => {
    const parsed = parseImageSearchQuery('猫');

    expect(parsed.timeRange).toBeNull();
    expect(parsed.contentQuery).toBe('猫');
    expect(parsed.contentTerms).toEqual(['猫']);
  });
});

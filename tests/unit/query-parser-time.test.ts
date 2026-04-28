import { describe, expect, it } from 'vitest';

import { parseImageSearchQuery } from '@electron/services/image-search/query-parser';

// Fixed reference date: Tuesday, 2026-04-28 10:00:00 local time (UTC+8 = 02:00:00 UTC)
// Day of week: Tuesday (day=2)
// Monday of this week: 2026-04-27
// Monday of last week: 2026-04-20
// This year: 2026, last year: 2025
const NOW = new Date('2026-04-28T10:00:00');

describe('query-parser: extended time expressions', () => {
  // ── 上周 / last week ────────────────────────────────────────────────────────
  it('parses 上周 as last Monday to this Monday', () => {
    const parsed = parseImageSearchQuery('上周拍的照片', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('上周');
    // Monday of last week: 2026-04-20 00:00 local -> ISO
    // Monday of this week: 2026-04-27 00:00 local -> ISO
    const start = new Date(parsed.timeRange!.start);
    const end = new Date(parsed.timeRange!.end);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(3); // April (0-indexed)
    expect(start.getDate()).toBe(20);
    expect(end.getDate()).toBe(27);
    expect(end.getMonth()).toBe(3);
  });

  it('parses 上个星期 as last week', () => {
    const parsed = parseImageSearchQuery('上个星期的猫', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('上周');
  });

  it('parses "last week" (English) as last Monday to this Monday', () => {
    const parsed = parseImageSearchQuery('last week photos', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('上周');
    const start = new Date(parsed.timeRange!.start);
    const end = new Date(parsed.timeRange!.end);
    expect(start.getDate()).toBe(20);
    expect(end.getDate()).toBe(27);
  });

  // ── 本周/这周 / this week ────────────────────────────────────────────────────
  it('parses 本周 as this Monday to next Monday', () => {
    const parsed = parseImageSearchQuery('本周拍的照片', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('本周');
    const start = new Date(parsed.timeRange!.start);
    const end = new Date(parsed.timeRange!.end);
    expect(start.getDate()).toBe(27); // this Monday
    expect(end.getDate()).toBe(4);   // next Monday (May 4)
    expect(end.getMonth()).toBe(4);  // May
  });

  it('parses 这周 the same as 本周', () => {
    const parsed = parseImageSearchQuery('这周的猫', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('本周');
    const start = new Date(parsed.timeRange!.start);
    expect(start.getDate()).toBe(27);
  });

  it('parses 这个星期 as this week', () => {
    const parsed = parseImageSearchQuery('这个星期的截图', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('本周');
  });

  it('parses "this week" (English) as this Monday to next Monday', () => {
    const parsed = parseImageSearchQuery('this week cat photos', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('本周');
    const start = new Date(parsed.timeRange!.start);
    expect(start.getDate()).toBe(27);
  });

  // ── 上周 should NOT match 上周末 ─────────────────────────────────────────────
  it('does NOT match 上周末 as 上周 (existing 上周末 handler takes precedence)', () => {
    const parsed = parseImageSearchQuery('上周末在公园', { now: NOW });
    expect(parsed.timeRange?.label).toBe('上周末');
  });

  // ── 去年 / last year ─────────────────────────────────────────────────────────
  it('parses 去年 as Jan 1 of last year to Jan 1 of this year', () => {
    const parsed = parseImageSearchQuery('去年的照片', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('去年');
    const start = new Date(parsed.timeRange!.start);
    const end = new Date(parsed.timeRange!.end);
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(0); // January
    expect(start.getDate()).toBe(1);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(0);
    expect(end.getDate()).toBe(1);
  });

  it('parses "last year" (English) as last year range', () => {
    const parsed = parseImageSearchQuery('last year sunset', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('去年');
    const start = new Date(parsed.timeRange!.start);
    expect(start.getFullYear()).toBe(2025);
  });

  // ── 今年 / this year ─────────────────────────────────────────────────────────
  it('parses 今年 as Jan 1 of this year to Jan 1 of next year', () => {
    const parsed = parseImageSearchQuery('今年拍的', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('今年');
    const start = new Date(parsed.timeRange!.start);
    const end = new Date(parsed.timeRange!.end);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(1);
    expect(end.getFullYear()).toBe(2027);
    expect(end.getMonth()).toBe(0);
    expect(end.getDate()).toBe(1);
  });

  it('parses "this year" (English) as this year range', () => {
    const parsed = parseImageSearchQuery('this year photos', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('今年');
    const start = new Date(parsed.timeRange!.start);
    expect(start.getFullYear()).toBe(2026);
  });

  // ── 最近N周 ──────────────────────────────────────────────────────────────────
  it('parses 最近两周 as 14 days ago to tomorrow', () => {
    const parsed = parseImageSearchQuery('最近两周的截图', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toContain('2');
    const start = new Date(parsed.timeRange!.start);
    const end = new Date(parsed.timeRange!.end);
    // start should be 14 days before today
    const today = new Date(NOW);
    today.setHours(0, 0, 0, 0);
    const expectedStart = new Date(today);
    expectedStart.setDate(expectedStart.getDate() - 14);
    expect(start.getDate()).toBe(expectedStart.getDate());
    // end should be tomorrow
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(end.getDate()).toBe(tomorrow.getDate());
  });

  it('parses 最近三个星期 as 3 weeks ago', () => {
    const parsed = parseImageSearchQuery('最近三个星期', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
  });

  it('parses 最近3周 (digit) as 3 weeks ago', () => {
    const parsed = parseImageSearchQuery('最近3周的照片', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    const start = new Date(parsed.timeRange!.start);
    const today = new Date(NOW);
    today.setHours(0, 0, 0, 0);
    const expectedStart = new Date(today);
    expectedStart.setDate(expectedStart.getDate() - 21);
    expect(start.getDate()).toBe(expectedStart.getDate());
  });

  // ── 最近N月 ──────────────────────────────────────────────────────────────────
  it('parses 最近三个月 as 3 months ago to tomorrow', () => {
    const parsed = parseImageSearchQuery('最近三个月', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    const start = new Date(parsed.timeRange!.start);
    // April is month 3 (0-indexed), April - 3 months = January = month 0
    // new Date(2026, 3, 28) - 3 months = new Date(2026, 0, 28) = Jan 28
    expect(start.getMonth()).toBe(0); // January
    expect(start.getFullYear()).toBe(2026);
  });

  it('parses 最近2个月 (digit) as 2 months ago', () => {
    const parsed = parseImageSearchQuery('最近2个月的旅行照片', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    const start = new Date(parsed.timeRange!.start);
    // April is month 3 (0-indexed), April - 2 months = February = month 1
    // new Date(2026, 3, 28) - 2 months = new Date(2026, 1, 28) = Feb 28
    expect(start.getMonth()).toBe(1); // February
    expect(start.getFullYear()).toBe(2026);
  });

  // ── 季节 / Seasons ───────────────────────────────────────────────────────────
  it('parses 春天 as Mar 1 to Jun 1', () => {
    // NOW is Apr 28 = currently in spring (Mar 1 - Jun 1)
    const parsed = parseImageSearchQuery('春天的花', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('春天');
    const start = new Date(parsed.timeRange!.start);
    const end = new Date(parsed.timeRange!.end);
    expect(start.getMonth()).toBe(2); // March
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(5);   // June
    expect(end.getDate()).toBe(1);
  });

  it('parses 春季 (variant) as spring', () => {
    const parsed = parseImageSearchQuery('春季拍的', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('春天');
  });

  it('parses spring (English) as spring', () => {
    const parsed = parseImageSearchQuery('spring flowers', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('春天');
  });

  it('parses 夏天 as Jun 1 to Sep 1', () => {
    const parsed = parseImageSearchQuery('夏天在海边', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('夏天');
    const start = new Date(parsed.timeRange!.start);
    const end = new Date(parsed.timeRange!.end);
    expect(start.getMonth()).toBe(5); // June
    expect(end.getMonth()).toBe(8);   // September
  });

  it('parses summer (English) as summer', () => {
    const parsed = parseImageSearchQuery('summer vacation', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('夏天');
  });

  it('parses 秋天 as Sep 1 to Dec 1', () => {
    const parsed = parseImageSearchQuery('秋天', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('秋天');
    const start = new Date(parsed.timeRange!.start);
    const end = new Date(parsed.timeRange!.end);
    expect(start.getMonth()).toBe(8);  // September
    expect(end.getMonth()).toBe(11);   // December
  });

  it('parses fall/autumn (English) as fall', () => {
    const parsed = parseImageSearchQuery('fall leaves', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('秋天');
  });

  it('parses autumn (English) as fall', () => {
    const parsed = parseImageSearchQuery('autumn scenery', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('秋天');
  });

  it('parses 冬天 as Dec 1 to Mar 1 (crosses year boundary)', () => {
    const parsed = parseImageSearchQuery('冬天', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('冬天');
    const start = new Date(parsed.timeRange!.start);
    const end = new Date(parsed.timeRange!.end);
    expect(start.getMonth()).toBe(11); // December
    expect(end.getMonth()).toBe(2);    // March
    // Start should be in 2025 (last winter since we're in spring 2026)
    // or 2026 December
    // NOW is April 2026, winter has already passed, so last winter: Dec 2025 - Mar 2026
    expect(start.getFullYear()).toBe(2025);
    expect(end.getFullYear()).toBe(2026);
  });

  it('parses winter (English) as winter', () => {
    const parsed = parseImageSearchQuery('winter snow', { now: NOW });
    expect(parsed.timeRange).not.toBeNull();
    expect(parsed.timeRange?.label).toBe('冬天');
  });

  // ── Residue (content terms remain after time is stripped) ───────────────────
  it('strips 上周 from query and keeps content terms', () => {
    const parsed = parseImageSearchQuery('上周拍的照片', { now: NOW });
    expect(parsed.contentTerms).toEqual([]);  // 照片 is removed as image word
  });

  it('strips time expression and keeps content terms for 本周', () => {
    const parsed = parseImageSearchQuery('本周的猫咪', { now: NOW });
    expect(parsed.contentTerms).toContain('猫咪');
  });

  it('strips 去年 and keeps content term', () => {
    const parsed = parseImageSearchQuery('去年的夕阳', { now: NOW });
    expect(parsed.contentTerms).toContain('夕阳');
  });

  it('strips season and keeps content term', () => {
    const parsed = parseImageSearchQuery('春天的花', { now: NOW });
    expect(parsed.contentTerms).toContain('花');
  });

  // ── Existing patterns must still work (regression) ──────────────────────────
  it('still parses 昨天 correctly', () => {
    const parsed = parseImageSearchQuery('昨天的图片', { now: NOW });
    expect(parsed.timeRange?.label).toBe('昨天');
  });

  it('still parses 前天 correctly', () => {
    const parsed = parseImageSearchQuery('前天的截图', { now: NOW });
    expect(parsed.timeRange?.label).toBe('前天');
  });

  it('still parses 今天 correctly', () => {
    const parsed = parseImageSearchQuery('今天', { now: NOW });
    expect(parsed.timeRange?.label).toBe('今天');
  });

  it('still parses 上周末 correctly', () => {
    const parsed = parseImageSearchQuery('上周末海边', { now: NOW });
    expect(parsed.timeRange?.label).toBe('上周末');
  });

  it('still parses 上月 correctly', () => {
    const parsed = parseImageSearchQuery('上月截图', { now: NOW });
    expect(parsed.timeRange?.label).toBe('上月');
  });

  it('still parses 最近N天 correctly', () => {
    const parsed = parseImageSearchQuery('最近7天', { now: NOW });
    expect(parsed.timeRange?.label).toBe('最近7天');
  });
});

import os from 'os';
import path from 'path';

export type MediaSourceKind = 'markdown' | 'markdown-linked' | 'html' | 'bare';

export interface ExtractedMedia {
  source: string;
  localPath?: string;
  type: 'image' | 'file';
  isLocal: boolean;
  isHttp: boolean;
  fileName?: string;
  sourceKind: MediaSourceKind;
}

export interface MediaParseOptions {
  /** default true — remove extracted media from returned text */
  stripFromText?: boolean;
}

export interface MediaParseResult {
  text: string;
  images: ExtractedMedia[];
  files: ExtractedMedia[];
  all: ExtractedMedia[];
}

export function isImagePath(p: string): boolean {
  return /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(p);
}

export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function normalizeLocalPath(p: string): string {
  let result = p;
  if (result.startsWith('~')) {
    result = os.homedir() + result.slice(1);
  }
  result = result.replace(/\\/g, '/');
  return result;
}

function buildMedia(
  source: string,
  sourceKind: MediaSourceKind,
  type: 'image' | 'file',
): ExtractedMedia {
  const http = isHttpUrl(source);
  const local = !http;
  const media: ExtractedMedia = {
    source,
    type,
    isLocal: local,
    isHttp: http,
    sourceKind,
    fileName: path.basename(source),
  };
  if (local) {
    media.localPath = normalizeLocalPath(source);
  }
  return media;
}

export function extractImagesFromText(
  text: string,
  options?: MediaParseOptions,
): MediaParseResult {
  const strip = options?.stripFromText !== false;
  let remaining = text;
  const images: ExtractedMedia[] = [];

  // 1. Markdown images: ![alt](src)
  const mdImageRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const mdImageMatches: Array<{ full: string; src: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = mdImageRe.exec(text)) !== null) {
    mdImageMatches.push({ full: m[0], src: m[2] });
  }
  for (const match of mdImageMatches) {
    images.push(buildMedia(match.src, 'markdown', 'image'));
    if (strip) remaining = remaining.replace(match.full, '');
  }

  // 2. Markdown links to image files: [alt](src) where src is an image
  const mdLinkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
  const mdLinkMatches: Array<{ full: string; src: string }> = [];
  while ((m = mdLinkRe.exec(text)) !== null) {
    // Skip if this was already matched as a Markdown image (starts with !)
    const before = text[m.index - 1];
    if (before === '!') continue;
    if (isImagePath(m[2])) {
      mdLinkMatches.push({ full: m[0], src: m[2] });
    }
  }
  for (const match of mdLinkMatches) {
    images.push(buildMedia(match.src, 'markdown-linked', 'image'));
    if (strip) remaining = remaining.replace(match.full, '');
  }

  // 3. HTML img tags: <img src="...">
  const htmlImgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const htmlMatches: Array<{ full: string; src: string }> = [];
  while ((m = htmlImgRe.exec(text)) !== null) {
    htmlMatches.push({ full: m[0], src: m[1] });
  }
  for (const match of htmlMatches) {
    images.push(buildMedia(match.src, 'html', 'image'));
    if (strip) remaining = remaining.replace(match.full, '');
  }

  // 4. Bare paths on their own line
  const bareRe = /^(\/[^\s]+|[A-Z]:\\[^\s]+|~\/[^\s]+)$/gm;
  const bareMatches: Array<{ full: string; src: string }> = [];
  while ((m = bareRe.exec(text)) !== null) {
    if (isImagePath(m[1])) {
      bareMatches.push({ full: m[0], src: m[1] });
    }
  }
  for (const match of bareMatches) {
    images.push(buildMedia(match.src, 'bare', 'image'));
    if (strip) remaining = remaining.replace(match.full, '');
  }

  return {
    text: remaining,
    images,
    files: [],
    all: [...images],
  };
}

export function extractFilesFromText(
  text: string,
  options?: MediaParseOptions,
): MediaParseResult {
  const strip = options?.stripFromText !== false;
  let remaining = text;
  const files: ExtractedMedia[] = [];

  // Only Markdown links, excluding image files
  const mdLinkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  const matches: Array<{ full: string; src: string }> = [];
  while ((m = mdLinkRe.exec(text)) !== null) {
    // Skip Markdown images (preceded by !)
    const before = text[m.index - 1];
    if (before === '!') continue;
    // Exclude image files
    if (!isImagePath(m[2])) {
      matches.push({ full: m[0], src: m[2] });
    }
  }

  for (const match of matches) {
    files.push(buildMedia(match.src, 'markdown-linked', 'file'));
    if (strip) remaining = remaining.replace(match.full, '');
  }

  return {
    text: remaining,
    images: [],
    files,
    all: [...files],
  };
}

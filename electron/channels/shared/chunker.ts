export function chunkPlainText(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];

  const lines = text.split('\n');
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    if (line.length > limit) {
      // Hard-split the oversized line
      if (current.length > 0) {
        chunks.push(current);
        current = '';
      }
      let remaining = line;
      while (remaining.length > limit) {
        chunks.push(remaining.slice(0, limit));
        remaining = remaining.slice(limit);
      }
      current = remaining;
      continue;
    }

    const separator = current.length > 0 ? '\n' : '';
    const candidate = current + separator + line;

    if (candidate.length > limit && current.length > 0) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current.length > 0 || chunks.length === 0) {
    chunks.push(current);
  }

  return chunks;
}

export function chunkMarkdownText(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];

  // Split into segments at paragraph boundaries (\n\n) and headings (\n#)
  // while tracking fenced code block state
  const segments: string[] = [];
  let pos = 0;
  let inCodeBlock = false;
  let segStart = 0;

  while (pos < text.length) {
    // Track code block state
    if (text.startsWith('```', pos)) {
      inCodeBlock = !inCodeBlock;
      pos += 3;
      continue;
    }

    if (!inCodeBlock) {
      // Check for paragraph boundary (\n\n)
      if (text.startsWith('\n\n', pos)) {
        segments.push(text.slice(segStart, pos));
        segStart = pos + 2;
        pos = segStart;
        continue;
      }

      // Check for heading boundary (\n#)
      if (text.startsWith('\n#', pos)) {
        segments.push(text.slice(segStart, pos));
        segStart = pos + 1; // keep the \n before # in next segment? No — start at #
        // Actually start at the # character
        segStart = pos + 1;
        pos = segStart;
        continue;
      }
    }

    pos++;
  }

  // Push the last segment
  if (segStart < text.length) {
    segments.push(text.slice(segStart));
  }

  // Filter out empty segments
  const nonEmpty = segments.filter((s) => s.length > 0);

  if (nonEmpty.length === 0) return [text];

  // Accumulate segments into chunks
  const chunks: string[] = [];
  let current = '';

  for (const seg of nonEmpty) {
    if (seg.length > limit) {
      // If segment contains a code block, keep it intact (never split inside code blocks)
      const hasCodeBlock = seg.includes('```');
      if (hasCodeBlock) {
        if (current.length > 0) {
          chunks.push(current);
          current = '';
        }
        chunks.push(seg);
        continue;
      }
      // Single segment exceeds limit — fall back to plain splitting
      if (current.length > 0) {
        chunks.push(current);
        current = '';
      }
      const subChunks = chunkPlainText(seg, limit);
      chunks.push(...subChunks);
      continue;
    }

    const separator = current.length > 0 ? '\n\n' : '';
    const candidate = current + separator + seg;

    if (candidate.length > limit && current.length > 0) {
      chunks.push(current);
      current = seg;
    } else {
      current = candidate;
    }
  }

  if (current.length > 0 || chunks.length === 0) {
    chunks.push(current);
  }

  return chunks;
}

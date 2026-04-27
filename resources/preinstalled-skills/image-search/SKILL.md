---
name: image-search
description: Search local images across Windows, macOS, and Linux/Kylin by natural-language time, content, or combined queries. Use when the user asks for images like "昨天创建的猫的图片", "上周末在海边拍的照片", "上月会议截图", or "find cat photos from yesterday".
---

# Image Search

Search local image files using a cross-platform Node script. This skill does not depend on macOS Spotlight, Windows indexing, or Linux desktop search.

## When To Use

Use this skill when the user asks to find local images, photos, screenshots, or pictures by:

- Time: `昨天`, `前天`, `今天`, `上周末`, `上月`, `最近三天`
- Content words: `猫`, `海边`, `会议截图`
- Combined conditions: `昨天创建的猫的图片`, `上周末在海边拍的照片`

## Command

```bash
node {baseDir}/scripts/search-images.mjs --root <directory> --query "<natural language query>" --json
```

Options:

- `--root <directory>`: image directory to scan. Repeatable.
- `--query <text>`: natural-language search query.
- `--limit <n>`: max results, default 50.
- `--now <iso>`: testing/debug override for current time.
- `--json`: machine-readable output.

## Examples

```bash
node {baseDir}/scripts/search-images.mjs --root ~/Pictures --query "昨天创建的猫的图片" --json
node {baseDir}/scripts/search-images.mjs --root ~/Pictures --query "上周末在海边拍的照片" --limit 20 --json
node {baseDir}/scripts/search-images.mjs --root ~/Desktop --query "上月会议截图" --json
```

## Semantics

- Time filters use file modification time by default, matching KTClaw's cross-platform behavior.
- Content matching is deterministic and local: filename/path terms plus built-in bilingual synonyms for common terms such as `猫 -> cat` and `海边 -> beach`.
- If results are too broad, ask for a narrower root directory or add more content words.

## Output

JSON output includes:

- `parsed`: parsed time range, image kind, and content terms.
- `totalScanned`: number of image files inspected.
- `totalMatched`: number matching before limit.
- `results`: paths, timestamps, size, and match reasons.

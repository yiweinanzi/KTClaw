---
name: image-search
description: Search local images using natural-language queries combining time, visual content, and similarity. Supports Chinese and English queries like '上周在海边拍的照片', 'last week beach photos', 'find photos similar to /path/to/photo.jpg'.
---

# Image Search

Search local image files using a cross-platform Node script. Semantic visual search (MobileCLIP S0) is always on — no environment variable needed.

## When To Use

Use this skill when the user asks to find local images, photos, screenshots, or pictures by:

- Time: `昨天`, `前天`, `今天`, `上周`, `本周`, `上周末`, `上月`, `去年`, `今年`, `最近三天`, `最近N周`, `最近N月`
- Season: `春天`, `夏天`, `秋天`, `冬天`
- Content words: `猫`, `海边`, `会议截图`
- Combined conditions: `昨天创建的猫的图片`, `上周末在海边拍的照片`, `去年夏天的风景照`
- Similarity: find photos similar to a given image path

## Check Index Status First

Before running a search, check the index status so you can set user expectations:

```bash
node {baseDir}/scripts/search-images.mjs --root <directory> --status --json
```

If the index is still building (`"state": "indexing"`), the first search may be slower as it uses real-time filesystem scanning. Once indexing is complete (`"state": "idle"`), searches use the fast vector index.

## Command

```bash
node {baseDir}/scripts/search-images.mjs --root <directory> --query "<natural language query>" --json
```

Options:

- `--root <directory>`: image directory to scan. Repeatable.
- `--query <text>`: natural-language search query (Chinese and English supported).
- `--limit <n>`: max results, default 50.
- `--status`: print current index status and exit (use with `--json`).
- `--similar-to <path>`: find images visually similar to the given image path.
- `--now <iso>`: testing/debug override for current time.
- `--json`: machine-readable JSON output.

Environment (internal, set automatically by the desktop app):

- `KTCLAW_HOST_API_PORT`: internal port for the Host API. Set automatically when running inside KTClaw.
- `KTCLAW_IMAGE_SEARCH_MODEL_CACHE`: optional shared MobileCLIP cache directory.

## Examples

```bash
# Check index status before searching
node {baseDir}/scripts/search-images.mjs --root ~/Pictures --status --json

# Search by time and content
node {baseDir}/scripts/search-images.mjs --root ~/Pictures --query "昨天创建的猫的图片" --json
node {baseDir}/scripts/search-images.mjs --root ~/Pictures --query "上周末在海边拍的照片" --limit 20 --json
node {baseDir}/scripts/search-images.mjs --root ~/Pictures --query "去年夏天的风景照" --json
node {baseDir}/scripts/search-images.mjs --root ~/Pictures --query "last week beach photos" --json

# Find similar images (replace <image-path> with the actual path the user provides)
node {baseDir}/scripts/search-images.mjs --root ~/Pictures --similar-to <image-path> --json

# Search by season
node {baseDir}/scripts/search-images.mjs --root ~/Pictures --query "春天的花" --json
node {baseDir}/scripts/search-images.mjs --root ~/Pictures --query "冬天雪景" --json
```

## Time Expressions Supported

| Expression | Meaning |
|------------|---------|
| 今天 / today | Today |
| 昨天 / yesterday | Yesterday |
| 前天 | Day before yesterday |
| 上周 / 本周 | Last week / This week |
| 上周末 | Last weekend |
| 上月 / 上个月 | Last month |
| 去年 / 今年 | Last year / This year |
| 最近N天 | Last N days |
| 最近N周 | Last N weeks |
| 最近N月 | Last N months |
| 春天 / 夏天 / 秋天 / 冬天 | Spring / Summer / Autumn / Winter |

## Semantics

- Time filters use EXIF date when available, falling back to file modification time.
- Semantic visual search uses MobileCLIP S0 embeddings — always enabled.
- When running inside KTClaw, the script uses the Host API for fast vector searches against the pre-built index.
- When the Host API is not available (standalone mode), the script loads MobileCLIP locally and performs real-time search.
- If results are too broad, ask for a narrower root directory or add more content words.

## Output

JSON output includes:

- `parsed`: parsed time range, image kind, and content terms.
- `totalScanned`: number of image files inspected.
- `totalMatched`: number matching before limit.
- `results`: paths, timestamps, size, and match reasons.
- `semantic`: whether semantic search was active and which model was used.

## How to Present Results

When presenting search results to the user:

1. Show a summary text table with filename, time, and size.
2. After the table, list the **full absolute paths** of the top results (up to 5) on separate lines. The chat system will automatically detect these paths and generate clickable image previews. Example format:

```
C:\Users\username\Pictures\photo.jpg
C:\Users\username\Pictures\sunset.png
```

Do NOT create fake file references, placeholder paths, or example paths like `reference.jpg`. Only output paths that actually appear in the search results JSON.

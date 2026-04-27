---
name: image-search
description: Search local images across Windows, macOS, and Linux/Kylin by natural-language time, content, or combined queries. Use when the user asks for images like "昨天创建的猫的图片", "上周末在海边拍的照片", "上月会议截图", or "find cat photos from yesterday".
---

# Image Search

Search local image files using a cross-platform Node script. This skill does not depend on macOS Spotlight, Windows indexing, or Linux desktop search.

For content descriptions where filenames may not contain the requested word, use `--semantic`. Semantic mode ranks images by text-image similarity with the small `Xenova/mobileclip_s0` quantized ONNX model. KTClaw does not download this model automatically by default; semantic mode uses an existing local/cache model unless `KTCLAW_IMAGE_SEARCH_ALLOW_REMOTE_MODELS=1` is set.

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
- `--semantic`: enable MobileCLIP S0 visual semantic search. Use this for content queries such as animals, scenes, people, objects, and screenshots.
- `--json`: machine-readable output.

Environment:

- `KTCLAW_IMAGE_SEARCH_MODEL_CACHE`: optional shared MobileCLIP cache directory. The desktop app sets this automatically for bundled skill runs.
- `KTCLAW_IMAGE_SEARCH_LOCAL_MODEL_PATH`: optional local model root containing `Xenova/mobileclip_s0`.
- `KTCLAW_IMAGE_SEARCH_ALLOW_REMOTE_MODELS=1`: explicitly allow model downloads. Remote loading tries ModelScope first, then hf-mirror, then Hugging Face.
- `KTCLAW_IMAGE_SEARCH_MODEL_REMOTE_HOST`: optional private mirror/CDN host. Use with `KTCLAW_IMAGE_SEARCH_MODEL_REMOTE_PATH_TEMPLATE` and `KTCLAW_IMAGE_SEARCH_MODEL_REVISION` when needed.

## Examples

```bash
node {baseDir}/scripts/search-images.mjs --root ~/Pictures --query "昨天创建的猫的图片" --json
node {baseDir}/scripts/search-images.mjs --root ~/Pictures --query "上周末在海边拍的照片" --limit 20 --semantic --json
node {baseDir}/scripts/search-images.mjs --root ~/Pictures --query "帮我搜索一张企鹅的图片" --semantic --json
node {baseDir}/scripts/search-images.mjs --root ~/Desktop --query "上月会议截图" --semantic --json
```

## Semantics

- Time filters use file modification time by default, matching KTClaw's cross-platform behavior.
- Without `--semantic`, content matching is deterministic and local: filename/path terms plus built-in bilingual synonyms for common terms such as `猫 -> cat` and `海边 -> beach`.
- With `--semantic`, content matching uses MobileCLIP S0 visual embeddings, so images can match even when filenames are generic. If no local/cache model is available and remote loading is not explicitly enabled, the script returns `semantic.enabled: false` and falls back to deterministic matching without downloading.
- If results are too broad, ask for a narrower root directory or add more content words.

## Output

JSON output includes:

- `parsed`: parsed time range, image kind, and content terms.
- `totalScanned`: number of image files inspected.
- `totalMatched`: number matching before limit.
- `results`: paths, timestamps, size, and match reasons.

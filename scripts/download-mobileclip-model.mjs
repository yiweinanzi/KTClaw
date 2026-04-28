#!/usr/bin/env node
/**
 * Download MobileCLIP S0 model files for bundling into the Electron app.
 * Places files at resources/image-search-models/Xenova/mobileclip_s0/
 *
 * Usage: node scripts/download-mobileclip-model.mjs
 *
 * Environment variables:
 *   HF_MIRROR - Override HuggingFace base URL (e.g. https://hf-mirror.com)
 */
import { mkdirSync, existsSync, createWriteStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MODEL_ID = 'Xenova/mobileclip_s0';
const REQUIRED_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'preprocessor_config.json',
  'onnx/text_model_quantized.onnx',
  'onnx/vision_model_quantized.onnx',
];

const OUTPUT_DIR = join(
  __dirname,
  '..',
  'resources',
  'image-search-models',
  ...MODEL_ID.split('/'),
);

const BASE_URL = process.env.HF_MIRROR?.replace(/\/+$/, '')
  || 'https://huggingface.co';

function fileUrl(file) {
  return `${BASE_URL}/${MODEL_ID}/resolve/main/${file}`;
}

async function downloadFile(file) {
  const dest = join(OUTPUT_DIR, file);
  if (existsSync(dest)) {
    console.log(`  ✓ ${file} (cached)`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  const url = fileUrl(file);
  console.log(`  ↓ ${file}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function main() {
  console.log(`Downloading MobileCLIP S0 model to ${OUTPUT_DIR}`);
  console.log(`Source: ${BASE_URL}/${MODEL_ID}`);
  console.log('');

  for (const file of REQUIRED_FILES) {
    await downloadFile(file);
  }

  console.log('');
  console.log('Done. Model ready for bundling.');
}

main().catch((err) => {
  console.error('Failed to download model:', err.message);
  process.exitCode = 1;
});

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'node_modules', 'pdfjs-dist');
const outputRoot = path.join(root, 'public', 'pdfjs');
const assetDirectories = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });
await Promise.all(assetDirectories.map((directory) => fs.cp(
  path.join(sourceRoot, directory),
  path.join(outputRoot, directory),
  { recursive: true },
)));

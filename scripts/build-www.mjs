// Copia pro diretório "www/" (webDir do Capacitor) exatamente os arquivos que
// o Cloudflare Workers já publica no site (ver wrangler.toml). "www/" não é
// versionado — é gerado toda vez antes de "npx cap sync" (ver package.json).
import { cpSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const wwwDir = path.join(root, 'www');

const FILES = [
  'index.html',
  'login.html',
  'manifest.json',
  'sw.js',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-512-maskable.png',
];
const DIRS = ['icons', '.well-known'];

rmSync(wwwDir, { recursive: true, force: true });
mkdirSync(wwwDir, { recursive: true });

for (const file of FILES) {
  const src = path.join(root, file);
  if (existsSync(src)) cpSync(src, path.join(wwwDir, file));
}
for (const dir of DIRS) {
  const src = path.join(root, dir);
  if (existsSync(src)) cpSync(src, path.join(wwwDir, dir), { recursive: true });
}

console.log('www/ pronto em', wwwDir);

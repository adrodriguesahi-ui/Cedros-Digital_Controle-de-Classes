// Servidor de desenvolvimento sem wrangler: node dev/servidor-local.mjs [porta]
// Roda o Worker em Node com um banco SQLite local (dev/local.sqlite).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/index.js';
import { criarD1 } from './d1-local.mjs';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const porta = Number(process.argv[2] || 8787);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const env = {
  DB: criarD1(join(raiz, 'dev', 'local.sqlite'), join(raiz, 'migrations')),
  ASSETS: {
    async fetch(req) {
      let caminho = new URL(req.url).pathname;
      if (caminho.endsWith('/')) caminho += 'index.html';
      const arq = normalize(join(raiz, 'public', caminho));
      if (!arq.startsWith(join(raiz, 'public'))) return new Response('Proibido', { status: 403 });
      try {
        return new Response(await readFile(arq), { headers: { 'content-type': TIPOS[extname(arq)] || 'application/octet-stream' } });
      } catch {
        return new Response('Não encontrado', { status: 404 });
      }
    },
  },
};

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  const resp = await worker.fetch(request, env);
  // Em http://localhost o cookie "Secure" funciona no Chrome; removemos por compatibilidade com outros navegadores
  const headers = Object.fromEntries(resp.headers);
  if (headers['set-cookie']) headers['set-cookie'] = headers['set-cookie'].replace('; Secure', '');
  res.writeHead(resp.status, headers);
  res.end(Buffer.from(await resp.arrayBuffer()));
}).listen(porta, () => console.log(`Controle de Classes rodando em http://localhost:${porta}`));

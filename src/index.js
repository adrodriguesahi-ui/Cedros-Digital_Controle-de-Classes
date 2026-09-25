/**
 * Cedros Digital · Controle de Classes
 * Cloudflare Worker: API REST (/api/*) + arquivos estáticos (pasta public/).
 * Banco: Cloudflare D1 (binding DB).
 */

import { ESQUEMA } from './esquema.js';

const SESSAO_COOKIE = 'cedros_sessao';
const SESSAO_DIAS = 30;
const PBKDF2_ITERACOES = 100000; // máximo aceito pelo runtime do Workers

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

const json = (dados, status = 200, headers = {}) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const aleatorioHex = (bytes) => hex(crypto.getRandomValues(new Uint8Array(bytes)));

async function hashSenha(senha, salt) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERACOES },
    chave,
    256,
  );
  return hex(bits);
}

function iguaisTempoConstante(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function lerCookie(request, nome) {
  const cab = request.headers.get('cookie') || '';
  for (const parte of cab.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return null;
}

function cookieSessao(token, maxAge) {
  return `${SESSAO_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function corpo(request) {
  try {
    return await request.json();
  } catch {
    throw new ErroHttp(400, 'Corpo da requisição inválido.');
  }
}

function texto(v, campo, { obrigatorio = true, max = 500 } = {}) {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  if (obrigatorio && !s) throw new ErroHttp(400, `Informe ${campo}.`);
  if (s.length > max) throw new ErroHttp(400, `${campo} muito longo.`);
  return s || null;
}

function inteiroOuNulo(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new ErroHttp(400, 'Valor numérico inválido.');
  return n;
}

function dataOuNulo(v, campo) {
  if (v === '' || v == null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ErroHttp(400, `${campo} inválida.`);
  return v;
}

const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });

const exigirAdmin = (u) => {
  if (u.papel !== 'admin') throw new ErroHttp(403, 'Apenas a diretoria pode fazer isso.');
};

// ---------------------------------------------------------------------------
// Banco: cria as tabelas automaticamente (uma vez por instância do Worker)
// ---------------------------------------------------------------------------

let bancoPronto = false;
async function garantirBanco(env) {
  if (bancoPronto) return;
  if (!env.DB) throw new ErroHttp(500, 'Banco de dados não configurado: ligue um banco D1 ao app com o nome "DB".');
  // Comandos idempotentes: rodar de novo (ex.: duas requisições ao mesmo tempo) não causa problema
  await env.DB.batch(ESQUEMA.map((sql) => env.DB.prepare(sql)));
  bancoPronto = true;
}

// ---------------------------------------------------------------------------
// Sessão / autenticação
// ---------------------------------------------------------------------------

async function usuarioDaSessao(env, request) {
  const token = lerCookie(request, SESSAO_COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.id, u.nome, u.email, u.papel, u.unidade_id, un.nome AS unidade_nome
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
       LEFT JOIN unidades un ON un.id = u.unidade_id
      WHERE s.token = ? AND s.expira_em > datetime('now') AND u.ativo = 1`,
  )
    .bind(token)
    .first();
}

async function criarSessao(env, usuarioId) {
  const token = aleatorioHex(32);
  await env.DB.prepare(`INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?, ?, datetime('now', ?))`)
    .bind(token, usuarioId, `+${SESSAO_DIAS} days`)
    .run();
  // limpeza oportunista de sessões vencidas
  await env.DB.prepare(`DELETE FROM sessoes WHERE expira_em <= datetime('now')`).run();
  return token;
}

async function totalUsuarios(env) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM usuarios').first();
  return r.n;
}

// ---------------------------------------------------------------------------
// Escopo: conselheiro vinculado a uma unidade só enxerga essa unidade
// ---------------------------------------------------------------------------

function filtroEscopo(u, alias = 'd') {
  if (u.papel === 'conselheiro' && u.unidade_id) return { sql: ` AND ${alias}.unidade_id = ?`, params: [u.unidade_id] };
  return { sql: '', params: [] };
}

async function desbravadorNoEscopo(env, u, id) {
  const esc = filtroEscopo(u);
  const d = await env.DB.prepare(`SELECT d.* FROM desbravadores d WHERE d.id = ?${esc.sql}`)
    .bind(id, ...esc.params)
    .first();
  if (!d) throw new ErroHttp(404, 'Desbravador não encontrado.');
  return d;
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

const rotas = [];
const rota = (metodo, padrao, handler, { publica = false } = {}) => {
  const chaves = [];
  const re = new RegExp(
    '^' + padrao.replace(/:(\w+)/g, (_, k) => (chaves.push(k), '(\\d+)')) + '$',
  );
  rotas.push({ metodo, re, chaves, handler, publica });
};

// --- Status / primeiro acesso -------------------------------------------------

rota('GET', '/api/status', async ({ env }) =>
  json({ precisaConfigurar: (await totalUsuarios(env)) === 0, nomeClube: env.NOME_CLUBE || '' }), {
  publica: true,
});

rota(
  'POST',
  '/api/setup',
  async ({ env, request }) => {
    if ((await totalUsuarios(env)) > 0) throw new ErroHttp(409, 'O sistema já foi configurado.');
    const b = await corpo(request);
    const nome = texto(b.nome, 'o nome', { max: 120 });
    const email = texto(b.email, 'o e-mail', { max: 200 }).toLowerCase();
    const senha = String(b.senha || '');
    if (senha.length < 8) throw new ErroHttp(400, 'A senha precisa ter pelo menos 8 caracteres.');
    const salt = aleatorioHex(16);
    const r = await env.DB.prepare(
      `INSERT INTO usuarios (nome, email, senha_hash, senha_salt, papel) VALUES (?, ?, ?, ?, 'admin')`,
    )
      .bind(nome, email, await hashSenha(senha, salt), salt)
      .run();
    const token = await criarSessao(env, r.meta.last_row_id);
    return json({ ok: true }, 201, { 'set-cookie': cookieSessao(token, SESSAO_DIAS * 86400) });
  },
  { publica: true },
);

// --- Login ---------------------------------------------------------------------

rota(
  'POST',
  '/api/login',
  async ({ env, request }) => {
    const b = await corpo(request);
    const email = String(b.email || '').trim().toLowerCase();
    const senha = String(b.senha || '');
    const u = await env.DB.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').bind(email).first();
    const hash = u ? await hashSenha(senha, u.senha_salt) : await hashSenha(senha, 'x');
    if (!u || !iguaisTempoConstante(hash, u.senha_hash)) throw new ErroHttp(401, 'E-mail ou senha incorretos.');
    const token = await criarSessao(env, u.id);
    return json({ ok: true }, 200, { 'set-cookie': cookieSessao(token, SESSAO_DIAS * 86400) });
  },
  { publica: true },
);

rota(
  'POST',
  '/api/logout',
  async ({ env, request }) => {
    const token = lerCookie(request, SESSAO_COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sessoes WHERE token = ?').bind(token).run();
    return json({ ok: true }, 200, { 'set-cookie': cookieSessao('', 0) });
  },
  { publica: true },
);

rota('GET', '/api/me', async ({ env, usuario }) => json({ ...usuario, nome_clube: env.NOME_CLUBE || '' }));

rota('PUT', '/api/me/senha', async ({ env, request, usuario }) => {
  const b = await corpo(request);
  const u = await env.DB.prepare('SELECT * FROM usuarios WHERE id = ?').bind(usuario.id).first();
  if (!iguaisTempoConstante(await hashSenha(String(b.atual || ''), u.senha_salt), u.senha_hash))
    throw new ErroHttp(400, 'Senha atual incorreta.');
  const nova = String(b.nova || '');
  if (nova.length < 8) throw new ErroHttp(400, 'A nova senha precisa ter pelo menos 8 caracteres.');
  const salt = aleatorioHex(16);
  await env.DB.prepare('UPDATE usuarios SET senha_hash = ?, senha_salt = ? WHERE id = ?')
    .bind(await hashSenha(nova, salt), salt, usuario.id)
    .run();
  return json({ ok: true });
});

// --- Unidades ------------------------------------------------------------------

rota('GET', '/api/unidades', async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT un.id, un.nome,
            (SELECT COUNT(*) FROM desbravadores d WHERE d.unidade_id = un.id AND d.ativo = 1) AS total
       FROM unidades un`,
  ).all();
  return json(results.sort(porNome));
});

rota('POST', '/api/unidades', async ({ env, request, usuario }) => {
  exigirAdmin(usuario);
  const nome = texto((await corpo(request)).nome, 'o nome da unidade', { max: 80 });
  try {
    const r = await env.DB.prepare('INSERT INTO unidades (nome) VALUES (?)').bind(nome).run();
    return json({ id: r.meta.last_row_id, nome }, 201);
  } catch {
    throw new ErroHttp(409, 'Já existe uma unidade com esse nome.');
  }
});

rota('PUT', '/api/unidades/:id', async ({ env, request, usuario, p }) => {
  exigirAdmin(usuario);
  const nome = texto((await corpo(request)).nome, 'o nome da unidade', { max: 80 });
  await env.DB.prepare('UPDATE unidades SET nome = ? WHERE id = ?').bind(nome, p.id).run();
  return json({ ok: true });
});

rota('DELETE', '/api/unidades/:id', async ({ env, usuario, p }) => {
  exigirAdmin(usuario);
  await env.DB.batch([
    env.DB.prepare('UPDATE desbravadores SET unidade_id = NULL WHERE unidade_id = ?').bind(p.id),
    env.DB.prepare('UPDATE usuarios SET unidade_id = NULL WHERE unidade_id = ?').bind(p.id),
    env.DB.prepare('DELETE FROM unidades WHERE id = ?').bind(p.id),
  ]);
  return json({ ok: true });
});

// --- Classes e requisitos ------------------------------------------------------

rota('GET', '/api/classes', async ({ env, usuario }) => {
  const esc = filtroEscopo(usuario);
  const { results } = await env.DB.prepare(
    `SELECT c.*,
            (SELECT COUNT(*) FROM requisitos r WHERE r.classe_id = c.id) AS total_requisitos,
            (SELECT COUNT(*) FROM desbravadores d WHERE d.classe_id = c.id AND d.ativo = 1${esc.sql}) AS total_desbravadores
       FROM classes c ORDER BY c.ordem`,
  )
    .bind(...esc.params)
    .all();
  return json(results);
});

rota('GET', '/api/classes/:id/requisitos', async ({ env, p }) => {
  const { results } = await env.DB.prepare(
    'SELECT * FROM requisitos WHERE classe_id = ? ORDER BY ordem, id',
  )
    .bind(p.id)
    .all();
  return json(results);
});

/**
 * Adiciona requisitos. Aceita:
 *  - { secao, descricao }             → um requisito
 *  - { lote: "texto" }                → vários; linhas que começam com "#" definem a seção
 */
rota('POST', '/api/classes/:id/requisitos', async ({ env, request, usuario, p }) => {
  exigirAdmin(usuario);
  const b = await corpo(request);
  const classe = await env.DB.prepare('SELECT id FROM classes WHERE id = ?').bind(p.id).first();
  if (!classe) throw new ErroHttp(404, 'Classe não encontrada.');
  const ult = await env.DB.prepare('SELECT COALESCE(MAX(ordem), 0) AS m FROM requisitos WHERE classe_id = ?')
    .bind(p.id)
    .first();
  let ordem = ult.m;
  const novos = [];
  if (typeof b.lote === 'string') {
    let secao = texto(b.secao, 'a seção', { obrigatorio: false, max: 120 }) || 'Gerais';
    for (const linhaBruta of b.lote.split(/\r?\n/)) {
      const linha = linhaBruta.trim();
      if (!linha) continue;
      if (linha.startsWith('#')) {
        secao = linha.replace(/^#+/, '').trim() || 'Gerais';
        continue;
      }
      novos.push({ secao, descricao: linha.replace(/^[-•*]\s*|^\d+[.)]\s*/, '').slice(0, 1000) });
    }
  } else {
    novos.push({
      secao: texto(b.secao, 'a seção', { obrigatorio: false, max: 120 }) || 'Gerais',
      descricao: texto(b.descricao, 'a descrição', { max: 1000 }),
    });
  }
  if (!novos.length) throw new ErroHttp(400, 'Nenhum requisito informado.');
  await env.DB.batch(
    novos.map((n) =>
      env.DB.prepare('INSERT INTO requisitos (classe_id, secao, ordem, descricao) VALUES (?, ?, ?, ?)').bind(
        p.id,
        n.secao,
        ++ordem,
        n.descricao,
      ),
    ),
  );
  return json({ adicionados: novos.length }, 201);
});

rota('PUT', '/api/requisitos/:id', async ({ env, request, usuario, p }) => {
  exigirAdmin(usuario);
  const b = await corpo(request);
  const atual = await env.DB.prepare('SELECT * FROM requisitos WHERE id = ?').bind(p.id).first();
  if (!atual) throw new ErroHttp(404, 'Requisito não encontrado.');
  await env.DB.prepare('UPDATE requisitos SET secao = ?, descricao = ?, ordem = ? WHERE id = ?')
    .bind(
      b.secao !== undefined ? texto(b.secao, 'a seção', { max: 120 }) : atual.secao,
      b.descricao !== undefined ? texto(b.descricao, 'a descrição', { max: 1000 }) : atual.descricao,
      b.ordem !== undefined ? inteiroOuNulo(b.ordem) ?? atual.ordem : atual.ordem,
      p.id,
    )
    .run();
  return json({ ok: true });
});

rota('DELETE', '/api/requisitos/:id', async ({ env, usuario, p }) => {
  exigirAdmin(usuario);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM progresso WHERE requisito_id = ?').bind(p.id),
    env.DB.prepare('DELETE FROM requisitos WHERE id = ?').bind(p.id),
  ]);
  return json({ ok: true });
});

// --- Desbravadores -------------------------------------------------------------

const SQL_LISTA_DESBRAVADORES = `
  SELECT d.id, d.nome, d.data_nascimento, d.unidade_id, d.classe_id, d.ativo, d.observacoes,
         un.nome AS unidade_nome, c.nome AS classe_nome, c.cor AS classe_cor,
         (SELECT COUNT(*) FROM requisitos r WHERE r.classe_id = d.classe_id) AS total_requisitos,
         (SELECT COUNT(*) FROM progresso pr JOIN requisitos r ON r.id = pr.requisito_id
           WHERE pr.desbravador_id = d.id AND r.classe_id = d.classe_id) AS concluidos
    FROM desbravadores d
    LEFT JOIN unidades un ON un.id = d.unidade_id
    LEFT JOIN classes c ON c.id = d.classe_id
   WHERE 1 = 1`;

rota('GET', '/api/desbravadores', async ({ env, url, usuario }) => {
  const esc = filtroEscopo(usuario);
  let sql = SQL_LISTA_DESBRAVADORES + esc.sql;
  const params = [...esc.params];
  const q = url.searchParams;
  if (q.get('classe_id')) (sql += ' AND d.classe_id = ?'), params.push(inteiroOuNulo(q.get('classe_id')));
  if (q.get('unidade_id')) (sql += ' AND d.unidade_id = ?'), params.push(inteiroOuNulo(q.get('unidade_id')));
  if (q.get('busca')) (sql += ' AND d.nome LIKE ?'), params.push(`%${q.get('busca')}%`);
  if (q.get('inativos') !== '1') sql += ' AND d.ativo = 1';
  sql += ' ORDER BY d.nome';
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return json(results);
});

async function validarDesbravador(env, b, usuario) {
  const dados = {
    nome: texto(b.nome, 'o nome', { max: 120 }),
    data_nascimento: dataOuNulo(b.data_nascimento, 'Data de nascimento'),
    unidade_id: inteiroOuNulo(b.unidade_id),
    classe_id: inteiroOuNulo(b.classe_id),
    observacoes: texto(b.observacoes, 'observações', { obrigatorio: false, max: 2000 }),
    ativo: b.ativo === undefined ? 1 : b.ativo ? 1 : 0,
  };
  if (usuario.papel === 'conselheiro' && usuario.unidade_id) dados.unidade_id = usuario.unidade_id;
  return dados;
}

rota('POST', '/api/desbravadores', async ({ env, request, usuario }) => {
  const d = await validarDesbravador(env, await corpo(request), usuario);
  const r = await env.DB.prepare(
    `INSERT INTO desbravadores (nome, data_nascimento, unidade_id, classe_id, observacoes, ativo)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(d.nome, d.data_nascimento, d.unidade_id, d.classe_id, d.observacoes, d.ativo)
    .run();
  return json({ id: r.meta.last_row_id }, 201);
});

rota('GET', '/api/desbravadores/:id', async ({ env, usuario, p }) => {
  const esc = filtroEscopo(usuario);
  const d = await env.DB.prepare(SQL_LISTA_DESBRAVADORES + ' AND d.id = ?' + esc.sql)
    .bind(p.id, ...esc.params)
    .first();
  if (!d) throw new ErroHttp(404, 'Desbravador não encontrado.');
  const { results: requisitos } = await env.DB.prepare(
    `SELECT r.id, r.secao, r.ordem, r.descricao, pr.concluido_em, u.nome AS registrado_por
       FROM requisitos r
       LEFT JOIN progresso pr ON pr.requisito_id = r.id AND pr.desbravador_id = ?
       LEFT JOIN usuarios u ON u.id = pr.registrado_por
      WHERE r.classe_id = ?
      ORDER BY r.ordem, r.id`,
  )
    .bind(p.id, d.classe_id ?? -1)
    .all();
  return json({ ...d, requisitos });
});

rota('PUT', '/api/desbravadores/:id', async ({ env, request, usuario, p }) => {
  await desbravadorNoEscopo(env, usuario, p.id);
  const d = await validarDesbravador(env, await corpo(request), usuario);
  await env.DB.prepare(
    `UPDATE desbravadores SET nome = ?, data_nascimento = ?, unidade_id = ?, classe_id = ?, observacoes = ?, ativo = ?
      WHERE id = ?`,
  )
    .bind(d.nome, d.data_nascimento, d.unidade_id, d.classe_id, d.observacoes, d.ativo, p.id)
    .run();
  return json({ ok: true });
});

rota('DELETE', '/api/desbravadores/:id', async ({ env, usuario, p }) => {
  exigirAdmin(usuario);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM progresso WHERE desbravador_id = ?').bind(p.id),
    env.DB.prepare('DELETE FROM desbravadores WHERE id = ?').bind(p.id),
  ]);
  return json({ ok: true });
});

/** Marca/desmarca requisitos. Corpo: { requisito_id | requisitos: [ids], concluido: bool, data?: 'AAAA-MM-DD' } */
rota('PUT', '/api/desbravadores/:id/progresso', async ({ env, request, usuario, p }) => {
  const d = await desbravadorNoEscopo(env, usuario, p.id);
  const b = await corpo(request);
  const ids = (Array.isArray(b.requisitos) ? b.requisitos : [b.requisito_id]).map(inteiroOuNulo).filter(Boolean);
  if (!ids.length) throw new ErroHttp(400, 'Informe o requisito.');
  const data = dataOuNulo(b.data, 'Data') || new Date().toISOString().slice(0, 10);
  const stmts = ids.map((rid) =>
    b.concluido
      ? env.DB.prepare(
          `INSERT INTO progresso (desbravador_id, requisito_id, concluido_em, registrado_por)
           SELECT ?, r.id, ?, ? FROM requisitos r WHERE r.id = ? AND r.classe_id = ?
           ON CONFLICT (desbravador_id, requisito_id) DO UPDATE SET concluido_em = excluded.concluido_em,
                                                                   registrado_por = excluded.registrado_por`,
        ).bind(p.id, data, usuario.id, rid, d.classe_id ?? -1)
      : env.DB.prepare('DELETE FROM progresso WHERE desbravador_id = ? AND requisito_id = ?').bind(p.id, rid),
  );
  await env.DB.batch(stmts);
  return json({ ok: true });
});

// --- Usuários (diretoria) -------------------------------------------------------

rota('GET', '/api/usuarios', async ({ env, usuario }) => {
  exigirAdmin(usuario);
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.nome, u.email, u.papel, u.unidade_id, u.ativo, un.nome AS unidade_nome
       FROM usuarios u LEFT JOIN unidades un ON un.id = u.unidade_id ORDER BY u.nome`,
  ).all();
  return json(results);
});

rota('POST', '/api/usuarios', async ({ env, request, usuario }) => {
  exigirAdmin(usuario);
  const b = await corpo(request);
  const nome = texto(b.nome, 'o nome', { max: 120 });
  const email = texto(b.email, 'o e-mail', { max: 200 }).toLowerCase();
  const papel = b.papel === 'admin' ? 'admin' : 'conselheiro';
  const senha = String(b.senha || '');
  if (senha.length < 8) throw new ErroHttp(400, 'A senha precisa ter pelo menos 8 caracteres.');
  const salt = aleatorioHex(16);
  try {
    const r = await env.DB.prepare(
      'INSERT INTO usuarios (nome, email, senha_hash, senha_salt, papel, unidade_id) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(nome, email, await hashSenha(senha, salt), salt, papel, inteiroOuNulo(b.unidade_id))
      .run();
    return json({ id: r.meta.last_row_id }, 201);
  } catch {
    throw new ErroHttp(409, 'Já existe um usuário com esse e-mail.');
  }
});

rota('PUT', '/api/usuarios/:id', async ({ env, request, usuario, p }) => {
  exigirAdmin(usuario);
  const b = await corpo(request);
  const alvo = await env.DB.prepare('SELECT * FROM usuarios WHERE id = ?').bind(p.id).first();
  if (!alvo) throw new ErroHttp(404, 'Usuário não encontrado.');
  const papel = b.papel === undefined ? alvo.papel : b.papel === 'admin' ? 'admin' : 'conselheiro';
  const ativo = b.ativo === undefined ? alvo.ativo : b.ativo ? 1 : 0;
  if (alvo.id === usuario.id && (papel !== 'admin' || !ativo))
    throw new ErroHttp(400, 'Você não pode remover o seu próprio acesso de diretoria.');
  await env.DB.prepare('UPDATE usuarios SET nome = ?, email = ?, papel = ?, unidade_id = ?, ativo = ? WHERE id = ?')
    .bind(
      b.nome !== undefined ? texto(b.nome, 'o nome', { max: 120 }) : alvo.nome,
      b.email !== undefined ? texto(b.email, 'o e-mail', { max: 200 }).toLowerCase() : alvo.email,
      papel,
      b.unidade_id !== undefined ? inteiroOuNulo(b.unidade_id) : alvo.unidade_id,
      ativo,
      p.id,
    )
    .run();
  if (b.senha) {
    if (String(b.senha).length < 8) throw new ErroHttp(400, 'A senha precisa ter pelo menos 8 caracteres.');
    const salt = aleatorioHex(16);
    await env.DB.batch([
      env.DB.prepare('UPDATE usuarios SET senha_hash = ?, senha_salt = ? WHERE id = ?').bind(
        await hashSenha(String(b.senha), salt),
        salt,
        p.id,
      ),
      env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(p.id),
    ]);
  }
  if (!ativo) await env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(p.id).run();
  return json({ ok: true });
});

// --- Relatórios ----------------------------------------------------------------

rota('GET', '/api/relatorios/resumo', async ({ env, usuario }) => {
  const esc = filtroEscopo(usuario);
  const { results: desbravadores } = await env.DB.prepare(SQL_LISTA_DESBRAVADORES + esc.sql + ' AND d.ativo = 1 ORDER BY d.nome')
    .bind(...esc.params)
    .all();
  const { results: classes } = await env.DB.prepare('SELECT * FROM classes ORDER BY ordem').all();
  const unidades = (await env.DB.prepare('SELECT * FROM unidades').all()).results.sort(porNome);

  const pct = (d) => (d.total_requisitos ? d.concluidos / d.total_requisitos : 0);
  const agrupar = (lista, chave) => {
    const g = lista.filter(chave);
    return {
      total: g.length,
      media: g.length ? g.reduce((s, d) => s + pct(d), 0) / g.length : 0,
      aptos: g.filter((d) => d.total_requisitos && d.concluidos >= d.total_requisitos).length,
    };
  };
  return json({
    total: desbravadores.length,
    media_geral: desbravadores.length ? desbravadores.reduce((s, d) => s + pct(d), 0) / desbravadores.length : 0,
    sem_classe: desbravadores.filter((d) => !d.classe_id).length,
    por_classe: classes.map((c) => ({ id: c.id, nome: c.nome, cor: c.cor, ...agrupar(desbravadores, (d) => d.classe_id === c.id) })),
    por_unidade: [
      ...unidades.map((u) => ({ id: u.id, nome: u.nome, ...agrupar(desbravadores, (d) => d.unidade_id === u.id) })),
      { id: null, nome: 'Sem unidade', ...agrupar(desbravadores, (d) => !d.unidade_id) },
    ].filter((u) => u.id !== null || u.total > 0),
    aptos: desbravadores.filter((d) => d.total_requisitos && d.concluidos >= d.total_requisitos),
    desbravadores,
  });
});

rota('GET', '/api/relatorios/progresso.csv', async ({ env, usuario }) => {
  const esc = filtroEscopo(usuario);
  const { results } = await env.DB.prepare(SQL_LISTA_DESBRAVADORES + esc.sql + ' AND d.ativo = 1 ORDER BY c.ordem, d.nome')
    .bind(...esc.params)
    .all();
  const campo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [
    ['Nome', 'Classe', 'Unidade', 'Data de nascimento', 'Requisitos concluídos', 'Total de requisitos', 'Progresso (%)'],
    ...results.map((d) => [
      d.nome,
      d.classe_nome,
      d.unidade_nome,
      d.data_nascimento,
      d.concluidos,
      d.total_requisitos,
      d.total_requisitos ? Math.round((100 * d.concluidos) / d.total_requisitos) : 0,
    ]),
  ];
  const csv = '﻿' + linhas.map((l) => l.map(campo).join(';')).join('\r\n');
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="progresso-classes.csv"',
    },
  });
});

// ---------------------------------------------------------------------------
// Entrada do Worker
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      await garantirBanco(env);
      // Proteção CSRF simples: requisições que alteram dados precisam vir do próprio site
      if (request.method !== 'GET') {
        const origem = request.headers.get('origin');
        if (origem && origem !== url.origin) throw new ErroHttp(403, 'Origem não permitida.');
      }
      for (const r of rotas) {
        if (r.metodo !== request.method) continue;
        const m = url.pathname.match(r.re);
        if (!m) continue;
        const p = Object.fromEntries(r.chaves.map((k, i) => [k, Number(m[i + 1])]));
        const usuario = r.publica ? null : await usuarioDaSessao(env, request);
        if (!r.publica && !usuario) throw new ErroHttp(401, 'Sessão expirada. Entre novamente.');
        return await r.handler({ request, env, url, p, usuario });
      }
      throw new ErroHttp(404, 'Rota não encontrada.');
    } catch (e) {
      if (e instanceof ErroHttp) return json({ erro: e.message }, e.status);
      console.error(e);
      return json({ erro: 'Erro interno. Tente novamente.' }, 500);
    }
  },
};

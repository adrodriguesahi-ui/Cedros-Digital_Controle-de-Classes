// Teste de ponta a ponta da API com banco em memória: npm run teste
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { criarD1 } from './d1-local.mjs';

const env = {
  DB: criarD1(':memory:'),
  NOME_CLUBE: 'Clube Teste',
  ASSETS: { fetch: async () => new Response('estático') },
};

function cliente() {
  let cookie = '';
  return async (metodo, caminho, corpo) => {
    const r = await worker.fetch(
      new Request('https://teste.local' + caminho, {
        method: metodo,
        headers: { 'content-type': 'application/json', cookie, origin: 'https://teste.local' },
        body: corpo ? JSON.stringify(corpo) : undefined,
      }),
      env,
    );
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const tipo = r.headers.get('content-type') || '';
    return { status: r.status, dados: tipo.includes('json') ? await r.json() : await r.text() };
  };
}

const admin = cliente();
const ok = (r, s = 200) => (assert.equal(r.status, s, JSON.stringify(r.dados)), r.dados);

const st = ok(await admin('GET', '/api/status'));
assert.equal(st.precisaConfigurar, true);
assert.equal(st.nomeClube, 'Clube Teste');
assert.equal((await admin('GET', '/api/me')).status, 401);
ok(await admin('POST', '/api/setup', { nome: 'Diretor', email: 'diretor@clube.org', senha: 'senha-forte-1' }), 201);
assert.equal((await admin('POST', '/api/setup', { nome: 'X', email: 'x@x', senha: '12345678' })).status, 409);
assert.equal(ok(await admin('GET', '/api/me')).papel, 'admin');

const classes = ok(await admin('GET', '/api/classes'));
assert.equal(classes.length, 6);
const amigo = classes.find((c) => c.nome === 'Amigo');

ok(await admin('POST', `/api/classes/${amigo.id}/requisitos`, {
  lote: '# Gerais\n1. Ter no mínimo 10 anos\n2. Ser membro ativo do clube\n# Descoberta Espiritual\n- Memorizar o voto\n\n',
}), 201);
const reqs = ok(await admin('GET', `/api/classes/${amigo.id}/requisitos`));
assert.equal(reqs.length, 3);
assert.equal(reqs[2].secao, 'Descoberta Espiritual');
assert.equal(reqs[0].descricao, 'Ter no mínimo 10 anos');

const un1 = ok(await admin('POST', '/api/unidades', { nome: 'Águias' }), 201);
const un2 = ok(await admin('POST', '/api/unidades', { nome: 'Leões' }), 201);
assert.equal((await admin('POST', '/api/unidades', { nome: 'Águias' })).status, 409);

const d1 = ok(await admin('POST', '/api/desbravadores', { nome: 'Ana', classe_id: amigo.id, unidade_id: un1.id, data_nascimento: '2015-03-02' }), 201);
const d2 = ok(await admin('POST', '/api/desbravadores', { nome: 'Bruno', classe_id: amigo.id, unidade_id: un2.id }), 201);

ok(await admin('PUT', `/api/desbravadores/${d1.id}/progresso`, { requisitos: reqs.map((r) => r.id), concluido: true }));
let det = ok(await admin('GET', `/api/desbravadores/${d1.id}`));
assert.equal(det.concluidos, 3);
assert.ok(det.requisitos.every((r) => r.concluido_em && r.registrado_por === 'Diretor'));
ok(await admin('PUT', `/api/desbravadores/${d1.id}/progresso`, { requisito_id: reqs[0].id, concluido: false }));
assert.equal(ok(await admin('GET', `/api/desbravadores/${d1.id}`)).concluidos, 2);
ok(await admin('PUT', `/api/desbravadores/${d1.id}/progresso`, { requisito_id: reqs[0].id, concluido: true }));

// Requisito de outra classe não pode ser marcado
const comp = classes.find((c) => c.nome === 'Companheiro');
ok(await admin('POST', `/api/classes/${comp.id}/requisitos`, { secao: 'Gerais', descricao: 'Ter 11 anos' }), 201);
const reqComp = ok(await admin('GET', `/api/classes/${comp.id}/requisitos`))[0];
ok(await admin('PUT', `/api/desbravadores/${d2.id}/progresso`, { requisito_id: reqComp.id, concluido: true }));
assert.equal(ok(await admin('GET', `/api/desbravadores/${d2.id}`)).concluidos, 0);

// Conselheiro vinculado à unidade Leões
ok(await admin('POST', '/api/usuarios', { nome: 'Carla', email: 'carla@clube.org', senha: 'conselheira1', unidade_id: un2.id }), 201);
const cons = cliente();
assert.equal((await cons('POST', '/api/login', { email: 'carla@clube.org', senha: 'errada123' })).status, 401);
ok(await cons('POST', '/api/login', { email: 'CARLA@clube.org', senha: 'conselheira1' }));
const lista = ok(await cons('GET', '/api/desbravadores'));
assert.deepEqual(lista.map((d) => d.nome), ['Bruno']);
assert.equal((await cons('GET', `/api/desbravadores/${d1.id}`)).status, 404);
assert.equal((await cons('PUT', `/api/desbravadores/${d1.id}/progresso`, { requisito_id: reqs[0].id, concluido: false })).status, 404);
ok(await cons('PUT', `/api/desbravadores/${d2.id}/progresso`, { requisito_id: reqs[0].id, concluido: true }));
const novo = ok(await cons('POST', '/api/desbravadores', { nome: 'Caio', classe_id: amigo.id, unidade_id: un1.id }), 201);
assert.equal(ok(await cons('GET', `/api/desbravadores/${novo.id}`)).unidade_id, un2.id, 'conselheiro cadastra só na própria unidade');
assert.equal((await cons('POST', '/api/unidades', { nome: 'X' })).status, 403);
assert.equal((await cons('GET', '/api/usuarios')).status, 403);
assert.equal((await cons('DELETE', `/api/desbravadores/${d2.id}`)).status, 403);

// Relatórios
const rel = ok(await admin('GET', '/api/relatorios/resumo'));
assert.equal(rel.total, 3);
assert.deepEqual(rel.aptos.map((d) => d.nome), ['Ana']);
assert.equal(rel.por_classe.find((c) => c.nome === 'Amigo').total, 3);
const relCons = ok(await cons('GET', '/api/relatorios/resumo'));
assert.equal(relCons.total, 2);
const csv = ok(await admin('GET', '/api/relatorios/progresso.csv'));
assert.match(csv, /"Ana";"Amigo";"Águias";"2015-03-02";"3";"3";"100"/);

// Excluir requisito remove progresso ligado a ele
ok(await admin('DELETE', `/api/requisitos/${reqs[2].id}`));
assert.equal(ok(await admin('GET', `/api/desbravadores/${d1.id}`)).total_requisitos, 2);

// Desativar usuário derruba a sessão
const carla = ok(await admin('GET', '/api/usuarios')).find((u) => u.email === 'carla@clube.org');
ok(await admin('PUT', `/api/usuarios/${carla.id}`, { ativo: false }));
assert.equal((await cons('GET', '/api/me')).status, 401);
assert.equal((await admin('PUT', `/api/usuarios/1`, { papel: 'conselheiro' })).status, 400);

// Troca de senha e logout
ok(await admin('PUT', '/api/me/senha', { atual: 'senha-forte-1', nova: 'outra-senha-2' }));
ok(await admin('POST', '/api/logout'));
assert.equal((await admin('GET', '/api/me')).status, 401);
ok(await admin('POST', '/api/login', { email: 'diretor@clube.org', senha: 'outra-senha-2' }));

// CSRF
const r = await worker.fetch(new Request('https://teste.local/api/login', { method: 'POST', headers: { origin: 'https://mal.com' }, body: '{}' }), env);
assert.equal(r.status, 403);

console.log('✔ Todos os testes da API passaram');

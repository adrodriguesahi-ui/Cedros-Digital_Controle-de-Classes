// Cedros Digital · Controle de Classes — interface (SPA sem dependências)

const app = document.getElementById('app');
const modal = document.getElementById('modal');
const estado = { usuario: null, classes: [], unidades: [], nomeClube: '' };

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const dataBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const idade = (iso) => {
  if (!iso) return null;
  const n = new Date(iso + 'T12:00:00'), h = new Date();
  let a = h.getFullYear() - n.getFullYear();
  if (h < new Date(h.getFullYear(), n.getMonth(), n.getDate())) a--;
  return a;
};
const ehAdmin = () => estado.usuario?.papel === 'admin';
const classePorId = (id) => estado.classes.find((c) => c.id === id);

async function api(metodo, caminho, corpo) {
  const r = await fetch('/api' + caminho, {
    method: metodo,
    headers: corpo ? { 'content-type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
    credentials: 'same-origin',
  });
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401 && !caminho.startsWith('/login') && !caminho.startsWith('/setup')) {
    estado.usuario = null;
    iniciar();
    throw new Error(dados.erro || 'Sessão expirada.');
  }
  if (!r.ok) throw new Error(dados.erro || 'Algo deu errado.');
  return dados;
}

let temporizadorAviso;
function aviso(msg, erro = false) {
  const el = document.getElementById('aviso');
  el.textContent = msg;
  el.className = 'mostrar' + (erro ? ' erro' : '');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => (el.className = ''), 2600);
}

function barra(valor, cor) {
  return `<div class="barra"${cor ? ` style="--cor:${esc(cor)}"` : ''}><i style="width:${valor}%"></i></div>`;
}
function chipClasse(nome, cor) {
  return nome ? `<span class="chip" style="--cor:${esc(cor)}">${esc(nome)}</span>` : '<span class="chip">Sem classe</span>';
}
function opcoes(lista, selecionado, vazio) {
  return (
    (vazio !== undefined ? `<option value="">${esc(vazio)}</option>` : '') +
    lista.map((i) => `<option value="${i.id}" ${i.id === selecionado ? 'selected' : ''}>${esc(i.nome)}</option>`).join('')
  );
}

/** Abre um formulário em modal. `aoSalvar(dados)` pode lançar erro para exibir no formulário. */
function abrirFormulario(titulo, camposHtml, aoSalvar, { rotuloSalvar = 'Salvar', extraAcoes = '' } = {}) {
  modal.innerHTML = `
    <form method="dialog" novalidate>
      <h2>${esc(titulo)}</h2>
      ${camposHtml}
      <div class="erro-form"></div>
      <div class="acoes">
        ${extraAcoes}
        <button type="button" class="btn sec" data-fechar>Cancelar</button>
        <button type="submit" class="btn">${esc(rotuloSalvar)}</button>
      </div>
    </form>`;
  const form = modal.querySelector('form');
  form.querySelector('[data-fechar]').onclick = () => modal.close();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const dados = Object.fromEntries(new FormData(form));
      form.querySelectorAll('input[type=checkbox]').forEach((c) => (dados[c.name] = c.checked));
      await aoSalvar(dados);
      modal.close();
    } catch (err) {
      form.querySelector('.erro-form').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  };
  modal.showModal();
  form.querySelector('input, select, textarea')?.focus();
  return form;
}

function confirmar(mensagem, rotulo = 'Confirmar') {
  return new Promise((ok) => {
    const form = abrirFormulario('Confirmação', `<p>${esc(mensagem)}</p>`, async () => ok(true), { rotuloSalvar: rotulo });
    form.querySelector('[type=submit]').className = 'btn perigo';
    form.querySelector('[data-fechar]').onclick = () => (modal.close(), ok(false));
    modal.addEventListener('cancel', () => ok(false), { once: true });
  });
}

// ---------------------------------------------------------------------------
// Acesso: primeiro acesso e login
// ---------------------------------------------------------------------------

function telaAcesso(configurar) {
  app.innerHTML = `
    <div class="tela-acesso">
      <form class="cartao" novalidate>
        <div class="marca-grande">
          <img src="icone.svg" alt="">
          <h1>Controle de Classes</h1>
          <p class="suave">${configurar ? 'Primeiro acesso: crie a conta da diretoria.' : esc(estado.nomeClube || 'Cedros Digital · Clube de Desbravadores')}</p>
        </div>
        ${configurar ? `<label class="campo"><span>Seu nome</span><input type="text" name="nome" autocomplete="name" required></label>` : ''}
        <label class="campo"><span>E-mail</span><input type="email" name="email" autocomplete="username" required></label>
        <label class="campo"><span>Senha</span><input type="password" name="senha" autocomplete="${configurar ? 'new-password' : 'current-password'}" required>
          ${configurar ? '<div class="dica">Mínimo de 8 caracteres.</div>' : ''}</label>
        <div class="erro-form"></div>
        <button class="btn" type="submit">${configurar ? 'Criar conta e entrar' : 'Entrar'}</button>
      </form>
    </div>`;
  const form = app.querySelector('form');
  form.querySelector('input').focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await api('POST', configurar ? '/setup' : '/login', Object.fromEntries(new FormData(form)));
      await iniciar();
    } catch (err) {
      form.querySelector('.erro-form').textContent = err.message;
      btn.disabled = false;
    }
  };
}

// ---------------------------------------------------------------------------
// Estrutura com abas
// ---------------------------------------------------------------------------

const ABAS = [
  { rota: 'painel', nome: 'Painel' },
  { rota: 'desbravadores', nome: 'Desbravadores' },
  { rota: 'relatorios', nome: 'Relatórios' },
  { rota: 'classes', nome: 'Classes e requisitos' },
  { rota: 'unidades', nome: 'Unidades' },
  { rota: 'usuarios', nome: 'Usuários', admin: true },
];

function moldura(abaAtiva) {
  const u = estado.usuario;
  app.innerHTML = `
    <header class="topo">
      <div class="topo-linha">
        <div class="marca"><img src="icone.svg" alt=""><div><small>${esc(estado.nomeClube || 'Cedros Digital')}</small>Controle de Classes</div></div>
        <button class="usuario-btn" id="btn-conta" title="Minha conta">${esc(u.nome.split(' ')[0])} ▾</button>
      </div>
      <nav class="abas">
        ${ABAS.filter((a) => !a.admin || ehAdmin())
          .map((a) => `<a href="#/${a.rota}" class="${a.rota === abaAtiva ? 'ativa' : ''}">${a.nome}</a>`)
          .join('')}
      </nav>
    </header>
    <main id="conteudo"><div class="carregando">Carregando…</div></main>`;
  document.getElementById('btn-conta').onclick = menuConta;
  return document.getElementById('conteudo');
}

function menuConta() {
  const u = estado.usuario;
  const form = abrirFormulario(
    'Minha conta',
    `<p style="margin-top:0"><b>${esc(u.nome)}</b><br><span class="suave">${esc(u.email)} · ${u.papel === 'admin' ? 'Diretoria' : 'Conselheiro(a)'}${u.unidade_nome ? ' · Unidade ' + esc(u.unidade_nome) : ''}</span></p>
     <h3 style="margin:14px 0 8px">Trocar senha</h3>
     <label class="campo"><span>Senha atual</span><input type="password" name="atual" autocomplete="current-password"></label>
     <label class="campo"><span>Nova senha</span><input type="password" name="nova" autocomplete="new-password"><div class="dica">Mínimo de 8 caracteres.</div></label>`,
    async (d) => {
      await api('PUT', '/me/senha', d);
      aviso('Senha alterada.');
    },
    { rotuloSalvar: 'Trocar senha', extraAcoes: '<button type="button" class="btn perigo" id="btn-sair" style="margin-right:auto">Sair</button>' },
  );
  form.querySelector('#btn-sair').onclick = async () => {
    await api('POST', '/logout');
    modal.close();
    estado.usuario = null;
    location.hash = '';
    iniciar();
  };
}

async function carregarBase() {
  [estado.classes, estado.unidades] = await Promise.all([api('GET', '/classes'), api('GET', '/unidades')]);
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

async function telaPainel(el) {
  const r = await api('GET', '/relatorios/resumo');
  const u = estado.usuario;
  el.innerHTML = `
    <div class="cabecalho">
      <div><h1>Olá, ${esc(u.nome.split(' ')[0])}!</h1>
        <p class="suave">${u.papel === 'conselheiro' && u.unidade_nome ? 'Unidade ' + esc(u.unidade_nome) : 'Visão geral do clube'}</p></div>
      <div class="acoes"><a class="btn" href="#/desbravadores">Registrar progresso</a></div>
    </div>
    <div class="grade grade-kpi">
      <div class="cartao kpi"><b>${r.total}</b><span>Desbravadores</span></div>
      <div class="cartao kpi"><b>${Math.round(r.media_geral * 100)}%</b><span>Progresso médio</span></div>
      <div class="cartao kpi"><b>${r.aptos.length}</b><span>Prontos p/ investidura</span></div>
    </div>
    <h2 style="margin:24px 0 12px">Classes</h2>
    <div class="grade grade-classes">
      ${r.por_classe
        .map(
          (c) => `
        <a class="cartao cartao-classe" style="--cor:${esc(c.cor)}" href="#/desbravadores?classe=${c.id}">
          <div class="linha"><h3>${esc(c.nome)}</h3><span class="num">${c.total}</span></div>
          <div class="pequeno suave">${c.total ? `${Math.round(c.media * 100)}% concluído em média` : 'Nenhum desbravador'}${c.aptos ? ` · <span class="selo">${c.aptos} pronto${c.aptos > 1 ? 's' : ''}</span>` : ''}</div>
          ${barra(Math.round(c.media * 100), c.cor)}
        </a>`,
        )
        .join('')}
    </div>
    ${r.sem_classe ? `<p class="suave pequeno" style="margin-top:12px">${r.sem_classe} desbravador(es) sem classe definida.</p>` : ''}
    ${
      !estado.classes.some((c) => c.total_requisitos) && ehAdmin()
        ? `<div class="cartao" style="margin-top:20px;border-left:5px solid var(--ouro)"><h3>Próximo passo</h3>
           <p class="suave" style="margin:6px 0 10px">Cadastre os requisitos de cada classe para começar a registrar o progresso.</p>
           <a class="btn sec" href="#/classes">Cadastrar requisitos</a></div>`
        : ''
    }`;
}

// ---------------------------------------------------------------------------
// Desbravadores
// ---------------------------------------------------------------------------

async function telaDesbravadores(el, params) {
  const filtro = {
    busca: params.get('busca') || '',
    classe: params.get('classe') || '',
    unidade: params.get('unidade') || '',
  };
  const restrito = estado.usuario.papel === 'conselheiro' && estado.usuario.unidade_id;
  el.innerHTML = `
    <div class="cabecalho">
      <div><h1>Desbravadores</h1><p class="suave" id="contagem"></p></div>
      <div class="acoes"><button class="btn" id="btn-novo">+ Novo desbravador</button></div>
    </div>
    <div class="filtros">
      <input type="search" id="f-busca" placeholder="Buscar pelo nome…" value="${esc(filtro.busca)}">
      <select id="f-classe">${opcoes(estado.classes, Number(filtro.classe), 'Todas as classes')}</select>
      <select id="f-unidade" ${restrito ? 'disabled' : ''}>${opcoes(estado.unidades, Number(filtro.unidade), 'Todas as unidades')}</select>
    </div>
    <div class="cartao" style="padding:4px 12px"><ul class="lista" id="lista"><li class="carregando">Carregando…</li></ul></div>`;

  const carregar = async () => {
    const q = new URLSearchParams();
    if (filtro.busca) q.set('busca', filtro.busca);
    if (filtro.classe) q.set('classe_id', filtro.classe);
    if (filtro.unidade) q.set('unidade_id', filtro.unidade);
    const lista = await api('GET', '/desbravadores?' + q);
    el.querySelector('#contagem').textContent = `${lista.length} encontrado${lista.length === 1 ? '' : 's'}`;
    el.querySelector('#lista').innerHTML = lista.length
      ? lista
          .map((d) => {
            const p = pct(d.concluidos, d.total_requisitos);
            const completo = d.total_requisitos && d.concluidos >= d.total_requisitos;
            return `<li><a class="item-desb" href="#/desbravador/${d.id}">
              <div><div class="nome">${esc(d.nome)}</div>
                <div class="meta">${chipClasse(d.classe_nome, d.classe_cor)}${d.unidade_nome ? `<span>${esc(d.unidade_nome)}</span>` : ''}${completo ? '<span class="selo">Pronto p/ investidura</span>' : ''}</div></div>
              <div class="pct">${d.total_requisitos ? `${d.concluidos}/${d.total_requisitos}` : '—'}${barra(p, d.classe_cor)}</div>
            </a></li>`;
          })
          .join('')
      : `<li class="vazio"><b>Nenhum desbravador encontrado</b>${filtro.busca || filtro.classe || filtro.unidade ? 'Ajuste os filtros acima.' : 'Cadastre o primeiro no botão “Novo desbravador”.'}</li>`;
  };

  const atualizarUrl = () => {
    const q = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v));
    history.replaceState(null, '', '#/desbravadores' + (q.toString() ? '?' + q : ''));
  };
  let t;
  el.querySelector('#f-busca').oninput = (e) => {
    filtro.busca = e.target.value.trim();
    clearTimeout(t);
    t = setTimeout(() => (atualizarUrl(), carregar()), 250);
  };
  el.querySelector('#f-classe').onchange = (e) => ((filtro.classe = e.target.value), atualizarUrl(), carregar());
  el.querySelector('#f-unidade').onchange = (e) => ((filtro.unidade = e.target.value), atualizarUrl(), carregar());
  el.querySelector('#btn-novo').onclick = () =>
    formDesbravador(null, async (id) => (location.hash = `#/desbravador/${id}`));
  await carregar();
}

function formDesbravador(d, depois) {
  const restrito = estado.usuario.papel === 'conselheiro' && estado.usuario.unidade_id;
  const form = abrirFormulario(
    d ? 'Editar desbravador' : 'Novo desbravador',
    `<label class="campo"><span>Nome completo</span><input type="text" name="nome" value="${esc(d?.nome)}" required></label>
     <label class="campo"><span>Data de nascimento</span><input type="date" name="data_nascimento" value="${esc(d?.data_nascimento)}"></label>
     <label class="campo"><span>Classe</span><select name="classe_id">${opcoes(estado.classes, d?.classe_id, 'Selecione…')}</select>
       <div class="dica" id="sugestao"></div></label>
     <label class="campo"><span>Unidade</span><select name="unidade_id" ${restrito ? 'disabled' : ''}>${opcoes(estado.unidades, d ? d.unidade_id : restrito ? estado.usuario.unidade_id : null, 'Sem unidade')}</select></label>
     <label class="campo"><span>Observações</span><input type="text" name="observacoes" value="${esc(d?.observacoes)}"></label>
     ${d ? `<label class="campo" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="ativo" ${d.ativo ? 'checked' : ''}> Ativo no clube</label>` : ''}`,
    async (dados) => {
      if (d) {
        await api('PUT', `/desbravadores/${d.id}`, dados);
        aviso('Dados atualizados.');
        depois?.(d.id);
      } else {
        const r = await api('POST', '/desbravadores', dados);
        aviso('Desbravador cadastrado.');
        depois?.(r.id);
      }
    },
    {
      extraAcoes:
        d && ehAdmin() ? '<button type="button" class="btn perigo" id="btn-excluir" style="margin-right:auto">Excluir</button>' : '',
    },
  );
  // Sugere a classe pela idade
  const nasc = form.querySelector('[name=data_nascimento]');
  const sugerir = () => {
    const i = idade(nasc.value);
    const c = i == null ? null : [...estado.classes].reverse().find((c) => c.idade_minima && i >= c.idade_minima);
    form.querySelector('#sugestao').textContent = i != null ? `${i} anos${c ? ` · classe sugerida pela idade: ${c.nome}` : ''}` : '';
  };
  nasc.oninput = sugerir;
  sugerir();
  form.querySelector('#btn-excluir')?.addEventListener('click', async () => {
    modal.close();
    if (!(await confirmar(`Excluir ${d.nome} e todo o histórico de progresso? Para apenas tirar da lista, desmarque "Ativo".`, 'Excluir'))) return;
    await api('DELETE', `/desbravadores/${d.id}`);
    aviso('Desbravador excluído.');
    location.hash = '#/desbravadores';
  });
}

async function telaDesbravador(el, id) {
  const d = await api('GET', `/desbravadores/${id}`);
  const p = pct(d.concluidos, d.total_requisitos);
  const secoes = [];
  for (const r of d.requisitos) {
    let s = secoes.find((x) => x.nome === r.secao);
    if (!s) secoes.push((s = { nome: r.secao, itens: [] }));
    s.itens.push(r);
  }
  const i = idade(d.data_nascimento);
  el.innerHTML = `
    <p style="margin:0 0 10px"><a href="#/desbravadores" class="pequeno">← Desbravadores</a></p>
    <div class="cartao perfil">
      <div class="anel" style="--p:${p};--cor:${esc(d.classe_cor || '')}" data-pct="${p}%"></div>
      <div class="info">
        <h1>${esc(d.nome)}</h1>
        <p>${chipClasse(d.classe_nome, d.classe_cor)} ${d.unidade_nome ? `<span class="suave pequeno">· ${esc(d.unidade_nome)}</span>` : ''}
          ${!d.ativo ? '<span class="selo">Inativo</span>' : ''}</p>
        <p class="suave pequeno">${i != null ? `${i} anos · ` : ''}${d.concluidos} de ${d.total_requisitos} requisitos concluídos${d.observacoes ? ' · ' + esc(d.observacoes) : ''}</p>
      </div>
      <div class="acoes"><button class="btn sec" id="btn-editar">Editar</button></div>
    </div>
    ${
      d.total_requisitos && d.concluidos >= d.total_requisitos
        ? `<div class="cartao" style="margin-top:12px;border-left:5px solid var(--ouro)"><b>🎉 Todos os requisitos concluídos!</b> <span class="suave">Pronto(a) para a investidura de ${esc(d.classe_nome)}.</span></div>`
        : ''
    }
    <div class="cartao" style="margin-top:16px">
      ${
        !d.classe_id
          ? '<div class="vazio"><b>Sem classe definida</b>Edite o cadastro para escolher a classe.</div>'
          : !d.requisitos.length
            ? `<div class="vazio"><b>A classe ${esc(d.classe_nome)} ainda não tem requisitos cadastrados</b>${ehAdmin() ? `<a href="#/classes/${d.classe_id}">Cadastrar requisitos</a>` : 'Peça à diretoria para cadastrá-los.'}</div>`
            : secoes
                .map((s, si) => {
                  const feitos = s.itens.filter((r) => r.concluido_em).length;
                  return `<div class="secao">
                <div class="secao-topo"><h3>${esc(s.nome)} <span class="suave">· ${feitos}/${s.itens.length}</span></h3>
                  <button class="btn fantasma pequeno" data-secao="${si}">${feitos === s.itens.length ? 'Desmarcar todos' : 'Marcar todos'}</button></div>
                ${s.itens
                  .map(
                    (r) => `<label class="req ${r.concluido_em ? 'feito' : ''}">
                  <input type="checkbox" data-req="${r.id}" ${r.concluido_em ? 'checked' : ''}><span class="caixa"></span>
                  <span class="txt"><span>${esc(r.descricao)}</span>
                    ${r.concluido_em ? `<span class="quando">Concluído em ${dataBR(r.concluido_em)}${r.registrado_por ? ' · ' + esc(r.registrado_por) : ''}</span>` : ''}</span>
                </label>`,
                  )
                  .join('')}
              </div>`;
                })
                .join('')
      }
    </div>`;

  const recarregar = () => telaDesbravador(el, id);
  el.querySelector('#btn-editar').onclick = () => formDesbravador(d, recarregar);
  el.querySelectorAll('[data-req]').forEach((cb) => {
    cb.onchange = async () => {
      cb.disabled = true;
      try {
        await api('PUT', `/desbravadores/${id}/progresso`, { requisito_id: Number(cb.dataset.req), concluido: cb.checked });
        await recarregar();
      } catch (e) {
        cb.checked = !cb.checked;
        cb.disabled = false;
        aviso(e.message, true);
      }
    };
  });
  el.querySelectorAll('[data-secao]').forEach((btn) => {
    btn.onclick = async () => {
      const s = secoes[Number(btn.dataset.secao)];
      const todos = s.itens.every((r) => r.concluido_em);
      await api('PUT', `/desbravadores/${id}/progresso`, { requisitos: s.itens.map((r) => r.id), concluido: !todos });
      aviso(todos ? 'Seção desmarcada.' : 'Seção concluída!');
      recarregar();
    };
  });
}

// ---------------------------------------------------------------------------
// Classes e requisitos
// ---------------------------------------------------------------------------

async function telaClasses(el) {
  el.innerHTML = `
    <div class="cabecalho"><div><h1>Classes e requisitos</h1>
      <p class="suave">${ehAdmin() ? 'Cadastre e ajuste os requisitos de cada classe conforme o cartão oficial.' : 'Requisitos de cada classe.'}</p></div></div>
    <div class="grade grade-classes">
      ${estado.classes
        .map(
          (c) => `<a class="cartao cartao-classe" style="--cor:${esc(c.cor)}" href="#/classes/${c.id}">
          <div class="linha"><h3>${esc(c.nome)}</h3><span class="suave pequeno">${c.idade_minima ? c.idade_minima + ' anos' : ''}</span></div>
          <div class="pequeno suave" style="margin-top:6px">${c.total_requisitos} requisito${c.total_requisitos === 1 ? '' : 's'} · ${c.total_desbravadores} desbravador${c.total_desbravadores === 1 ? '' : 'es'}</div>
        </a>`,
        )
        .join('')}
    </div>`;
}

async function telaClasse(el, id) {
  const c = classePorId(id);
  if (!c) return (el.innerHTML = '<div class="vazio"><b>Classe não encontrada</b></div>');
  const reqs = await api('GET', `/classes/${id}/requisitos`);
  const secoes = [];
  for (const r of reqs) {
    let s = secoes.find((x) => x.nome === r.secao);
    if (!s) secoes.push((s = { nome: r.secao, itens: [] }));
    s.itens.push(r);
  }
  const admin = ehAdmin();
  let n = 0;
  el.innerHTML = `
    <p style="margin:0 0 10px"><a href="#/classes" class="pequeno">← Classes</a></p>
    <div class="cabecalho">
      <div><h1><span class="chip" style="--cor:${esc(c.cor)};font-size:1rem;padding:4px 12px">${esc(c.nome)}</span></h1>
        <p class="suave">${reqs.length} requisito${reqs.length === 1 ? '' : 's'}</p></div>
      ${admin ? `<div class="acoes"><button class="btn sec" id="btn-um">+ Requisito</button><button class="btn" id="btn-lote">Adicionar em lote</button></div>` : ''}
    </div>
    <div class="cartao">
      ${
        reqs.length
          ? secoes
              .map(
                (s) => `<div class="secao"><div class="secao-topo"><h3>${esc(s.nome)}</h3></div>
              ${s.itens
                .map(
                  (r) => `<div class="req-admin"><span class="n">${++n}.</span><span class="txt">${esc(r.descricao)}</span>
                  ${admin ? `<button class="btn fantasma pequeno" data-editar="${r.id}">Editar</button>` : ''}</div>`,
                )
                .join('')}</div>`,
              )
              .join('')
          : `<div class="vazio"><b>Nenhum requisito cadastrado</b>${admin ? 'Use “Adicionar em lote” para colar a lista do cartão da classe de uma vez.' : ''}</div>`
      }
    </div>`;
  if (!admin) return;

  const recarregar = async () => {
    await carregarBase();
    telaClasse(el, id);
  };
  const listaSecoes = [...new Set(reqs.map((r) => r.secao))];
  const datalist = `<datalist id="dl-secoes">${listaSecoes.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>`;

  el.querySelector('#btn-um').onclick = () =>
    abrirFormulario(
      `Novo requisito · ${c.nome}`,
      `<label class="campo"><span>Seção</span><input type="text" name="secao" list="dl-secoes" value="${esc(listaSecoes.at(-1) || 'Gerais')}">${datalist}</label>
       <label class="campo"><span>Descrição</span><input type="text" name="descricao" required></label>`,
      async (d) => {
        await api('POST', `/classes/${id}/requisitos`, d);
        aviso('Requisito adicionado.');
        recarregar();
      },
    );

  el.querySelector('#btn-lote').onclick = () =>
    abrirFormulario(
      `Adicionar em lote · ${c.nome}`,
      `<label class="campo"><span>Cole os requisitos, um por linha</span>
        <textarea name="lote" placeholder="# Gerais\n1. Primeiro requisito\n2. Segundo requisito\n# Descoberta Espiritual\n1. …"></textarea>
        <div class="dica">Linhas que começam com <b>#</b> indicam a seção dos requisitos seguintes. Numeração e marcadores no início da linha são removidos automaticamente.</div></label>`,
      async (d) => {
        const r = await api('POST', `/classes/${id}/requisitos`, d);
        aviso(`${r.adicionados} requisito(s) adicionados.`);
        recarregar();
      },
      { rotuloSalvar: 'Adicionar' },
    );

  el.querySelectorAll('[data-editar]').forEach((b) => {
    b.onclick = () => {
      const r = reqs.find((x) => x.id === Number(b.dataset.editar));
      const form = abrirFormulario(
        'Editar requisito',
        `<label class="campo"><span>Seção</span><input type="text" name="secao" list="dl-secoes" value="${esc(r.secao)}">${datalist}</label>
         <label class="campo"><span>Descrição</span><input type="text" name="descricao" value="${esc(r.descricao)}" required></label>
         <label class="campo"><span>Ordem</span><input type="text" inputmode="numeric" name="ordem" value="${r.ordem}"><div class="dica">Número usado para ordenar a lista.</div></label>`,
        async (d) => {
          await api('PUT', `/requisitos/${r.id}`, d);
          aviso('Requisito atualizado.');
          recarregar();
        },
        { extraAcoes: '<button type="button" class="btn perigo" id="btn-excluir" style="margin-right:auto">Excluir</button>' },
      );
      form.querySelector('#btn-excluir').onclick = async () => {
        modal.close();
        if (!(await confirmar('Excluir este requisito? O progresso registrado nele também será apagado.', 'Excluir'))) return;
        await api('DELETE', `/requisitos/${r.id}`);
        aviso('Requisito excluído.');
        recarregar();
      };
    };
  });
}

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------

async function telaUnidades(el) {
  await carregarBase();
  const admin = ehAdmin();
  el.innerHTML = `
    <div class="cabecalho"><div><h1>Unidades</h1><p class="suave">${estado.unidades.length} unidade(s)</p></div>
      ${admin ? '<div class="acoes"><button class="btn" id="btn-nova">+ Nova unidade</button></div>' : ''}</div>
    <div class="cartao" style="padding:4px 12px"><ul class="lista">
      ${
        estado.unidades.length
          ? estado.unidades
              .map(
                (u) => `<li style="display:flex;align-items:center;gap:8px;padding:12px 4px">
          <a href="#/desbravadores?unidade=${u.id}" style="flex:1;font-weight:700;text-decoration:none;color:inherit">${esc(u.nome)}</a>
          <span class="suave pequeno">${u.total} desbravador${u.total === 1 ? '' : 'es'}</span>
          ${admin ? `<button class="btn fantasma pequeno" data-editar="${u.id}">Editar</button>` : ''}</li>`,
              )
              .join('')
          : '<li class="vazio"><b>Nenhuma unidade cadastrada</b>As unidades agrupam os desbravadores por conselheiro.</li>'
      }</ul></div>`;
  if (!admin) return;
  const recarregar = () => telaUnidades(el);
  el.querySelector('#btn-nova').onclick = () =>
    abrirFormulario('Nova unidade', '<label class="campo"><span>Nome</span><input type="text" name="nome" required></label>', async (d) => {
      await api('POST', '/unidades', d);
      aviso('Unidade criada.');
      recarregar();
    });
  el.querySelectorAll('[data-editar]').forEach((b) => {
    b.onclick = () => {
      const u = estado.unidades.find((x) => x.id === Number(b.dataset.editar));
      const form = abrirFormulario(
        'Editar unidade',
        `<label class="campo"><span>Nome</span><input type="text" name="nome" value="${esc(u.nome)}" required></label>`,
        async (d) => {
          await api('PUT', `/unidades/${u.id}`, d);
          aviso('Unidade atualizada.');
          recarregar();
        },
        { extraAcoes: '<button type="button" class="btn perigo" id="btn-excluir" style="margin-right:auto">Excluir</button>' },
      );
      form.querySelector('#btn-excluir').onclick = async () => {
        modal.close();
        if (!(await confirmar(`Excluir a unidade ${u.nome}? Os desbravadores dela ficarão sem unidade.`, 'Excluir'))) return;
        await api('DELETE', `/unidades/${u.id}`);
        aviso('Unidade excluída.');
        recarregar();
      };
    };
  });
}

// ---------------------------------------------------------------------------
// Usuários (diretoria)
// ---------------------------------------------------------------------------

async function telaUsuarios(el) {
  if (!ehAdmin()) return (el.innerHTML = '<div class="vazio"><b>Acesso restrito à diretoria</b></div>');
  const usuarios = await api('GET', '/usuarios');
  el.innerHTML = `
    <div class="cabecalho"><div><h1>Usuários</h1><p class="suave">Diretoria e conselheiros com acesso ao sistema.</p></div>
      <div class="acoes"><button class="btn" id="btn-novo">+ Novo usuário</button></div></div>
    <div class="cartao tabela-wrap"><table>
      <thead><tr><th>Nome</th><th>Perfil</th><th>Unidade</th><th></th></tr></thead>
      <tbody>${usuarios
        .map(
          (u) => `<tr style="${u.ativo ? '' : 'opacity:.5'}">
          <td><b>${esc(u.nome)}</b><br><span class="suave pequeno">${esc(u.email)}</span></td>
          <td>${u.papel === 'admin' ? 'Diretoria' : 'Conselheiro(a)'}${u.ativo ? '' : ' · <span class="selo">Inativo</span>'}</td>
          <td>${esc(u.unidade_nome || (u.papel === 'admin' ? '—' : 'Todas'))}</td>
          <td class="num"><button class="btn fantasma pequeno" data-editar="${u.id}">Editar</button></td></tr>`,
        )
        .join('')}</tbody></table></div>
    <p class="suave pequeno" style="margin-top:12px"><b>Diretoria</b> gerencia tudo. <b>Conselheiro(a)</b> cadastra desbravadores e registra progresso; se tiver uma unidade definida, vê apenas os desbravadores dela.</p>`;

  const campos = (u) => `
    <label class="campo"><span>Nome</span><input type="text" name="nome" value="${esc(u?.nome)}" required></label>
    <label class="campo"><span>E-mail</span><input type="email" name="email" value="${esc(u?.email)}" required></label>
    <label class="campo"><span>Perfil</span><select name="papel">
      <option value="conselheiro" ${u?.papel !== 'admin' ? 'selected' : ''}>Conselheiro(a) / Instrutor(a)</option>
      <option value="admin" ${u?.papel === 'admin' ? 'selected' : ''}>Diretoria</option></select></label>
    <label class="campo"><span>Unidade</span><select name="unidade_id">${opcoes(estado.unidades, u?.unidade_id, 'Todas as unidades')}</select></label>
    <label class="campo"><span>${u ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial'}</span><input type="password" name="senha" autocomplete="new-password" ${u ? '' : 'required'}>
      <div class="dica">Mínimo de 8 caracteres. A pessoa pode trocar depois em “Minha conta”.</div></label>
    ${u ? `<label class="campo" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="ativo" ${u.ativo ? 'checked' : ''}> Acesso ativo</label>` : ''}`;

  const recarregar = () => telaUsuarios(el);
  el.querySelector('#btn-novo').onclick = () =>
    abrirFormulario('Novo usuário', campos(null), async (d) => {
      await api('POST', '/usuarios', d);
      aviso('Usuário criado.');
      recarregar();
    });
  el.querySelectorAll('[data-editar]').forEach((b) => {
    b.onclick = () => {
      const u = usuarios.find((x) => x.id === Number(b.dataset.editar));
      abrirFormulario('Editar usuário', campos(u), async (d) => {
        if (!d.senha) delete d.senha;
        await api('PUT', `/usuarios/${u.id}`, d);
        aviso('Usuário atualizado.');
        recarregar();
      });
    };
  });
}

// ---------------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------------

async function telaRelatorios(el) {
  const r = await api('GET', '/relatorios/resumo');
  const linha = (g, extra = '') => `<tr>
    <td class="nome-col">${extra}${esc(g.nome)}</td><td class="num">${g.total}</td>
    <td class="num" style="min-width:90px">${g.total ? Math.round(g.media * 100) + '%' : '—'}${g.total ? barra(Math.round(g.media * 100), g.cor) : ''}</td>
    <td class="num">${g.aptos}</td></tr>`;
  const cab = (t) => `<thead><tr><th>${t}</th><th class="num">Qtd.</th><th class="num">Média</th><th class="num">Prontos</th></tr></thead>`;
  el.innerHTML = `
    <div class="cabecalho"><div><h1>Relatórios</h1><p class="suave">Gerado em ${new Date().toLocaleDateString('pt-BR')}</p></div>
      <div class="acoes"><a class="btn sec" href="/api/relatorios/progresso.csv">Baixar planilha (CSV)</a><button class="btn sec" onclick="print()">Imprimir</button></div></div>
    <div class="pilha">
      <div class="cartao"><h2>Por classe</h2><div class="tabela-wrap"><table>${cab('Classe')}<tbody>
        ${r.por_classe.map((c) => linha(c, `<span class="ponto" style="--cor:${esc(c.cor)}"></span>`)).join('')}</tbody></table></div></div>
      <div class="cartao"><h2>Por unidade</h2><div class="tabela-wrap"><table>${cab('Unidade')}<tbody>
        ${r.por_unidade.length ? r.por_unidade.map((u) => linha(u)).join('') : '<tr><td colspan="4" class="suave">Nenhuma unidade.</td></tr>'}</tbody></table></div></div>
      <div class="cartao"><h2>Prontos para a investidura</h2>
        ${
          r.aptos.length
            ? `<div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>Classe</th><th>Unidade</th></tr></thead><tbody>
              ${r.aptos.map((d) => `<tr><td><a href="#/desbravador/${d.id}">${esc(d.nome)}</a></td><td>${chipClasse(d.classe_nome, d.classe_cor)}</td><td>${esc(d.unidade_nome || '—')}</td></tr>`).join('')}
              </tbody></table></div>`
            : '<p class="suave">Ninguém concluiu todos os requisitos ainda.</p>'
        }</div>
      <div class="cartao"><h2>Progresso individual</h2><div class="tabela-wrap"><table>
        <thead><tr><th>Nome</th><th>Classe</th><th class="oculta-mob">Unidade</th><th class="num">Req.</th><th class="num">%</th></tr></thead><tbody>
        ${[...r.desbravadores]
          .sort((a, b) => (a.classe_id ?? 99) - (b.classe_id ?? 99) || a.nome.localeCompare(b.nome))
          .map(
            (d) => `<tr><td><a href="#/desbravador/${d.id}">${esc(d.nome)}</a></td><td>${chipClasse(d.classe_nome, d.classe_cor)}</td>
            <td class="oculta-mob">${esc(d.unidade_nome || '—')}</td><td class="num">${d.concluidos}/${d.total_requisitos}</td><td class="num">${pct(d.concluidos, d.total_requisitos)}%</td></tr>`,
          )
          .join('')}</tbody></table></div></div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Roteador
// ---------------------------------------------------------------------------

async function rotear() {
  if (!estado.usuario) return;
  const [caminho, qs] = (location.hash.slice(2) || 'painel').split('?');
  const partes = caminho.split('/');
  const params = new URLSearchParams(qs || '');
  const aba = { desbravador: 'desbravadores' }[partes[0]] || partes[0];
  const el = moldura(aba);
  try {
    if (partes[0] === 'painel') await telaPainel(el);
    else if (partes[0] === 'desbravadores') await telaDesbravadores(el, params);
    else if (partes[0] === 'desbravador') await telaDesbravador(el, Number(partes[1]));
    else if (partes[0] === 'classes' && partes[1]) await telaClasse(el, Number(partes[1]));
    else if (partes[0] === 'classes') await telaClasses(el);
    else if (partes[0] === 'unidades') await telaUnidades(el);
    else if (partes[0] === 'usuarios') await telaUsuarios(el);
    else if (partes[0] === 'relatorios') await telaRelatorios(el);
    else location.hash = '#/painel';
  } catch (e) {
    el.innerHTML = `<div class="vazio"><b>Não foi possível carregar</b>${esc(e.message)}</div>`;
  }
  window.scrollTo(0, 0);
}

async function iniciar() {
  try {
    estado.usuario = await fetch('/api/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null));
    if (!estado.usuario) {
      const s = await fetch('/api/status').then((r) => r.json());
      estado.nomeClube = s.nomeClube;
      return telaAcesso(s.precisaConfigurar);
    }
    estado.nomeClube = estado.usuario.nome_clube;
    if (estado.nomeClube) document.title = `Controle de Classes · ${estado.nomeClube}`;
    await carregarBase();
    rotear();
  } catch {
    app.innerHTML = '<div class="vazio"><b>Sem conexão</b>Verifique a internet e recarregue a página.</div>';
  }
}

window.addEventListener('hashchange', async () => {
  if (modal.open) modal.close();
  if (estado.usuario) {
    await carregarBase().catch(() => {});
    rotear();
  }
});
iniciar();

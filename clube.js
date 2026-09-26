// =============================================================================
// CONFIGURAÇÃO DO CLUBE
// -----------------------------------------------------------------------------
// Este é o ÚNICO arquivo que precisa ser editado para colocar o app no ar para
// um clube. Veja o passo a passo completo no README.md.
// =============================================================================
window.CLUBE_CONFIG = {
  // Nome do app (aparece na abertura, no topo e nos PDFs). Ex.: "Cedros Digital"
  appNome: 'Clube Digital',

  // Nome do clube, sem o "Clube de Desbravadores" na frente. Ex.: "Cedros do Líbano"
  nomeClube: 'Nome do Clube',

  // Código do clube no SGC (aparece nas fichas em PDF). Deixe '' se não tiver.
  codigoClube: '',

  // Endereço público do app depois de publicado (usado nos links e QR Codes).
  // Ex.: 'https://meu-clube.minha-conta.workers.dev'
  urlPublica: '',

  // Projeto Supabase deste clube: Project Settings → API (ou "API Keys").
  supabaseUrl: 'https://ryxkwaybymeknadyfgay.supabase.co',
  supabaseAnonKey: 'sb_publishable_82yLwYxh2BQ_DB_9D7K5oA_3xS7CiVi',

  // Logo do clube (arquivo na raiz do site, de preferência PNG quadrado com fundo transparente).
  logo: 'logo.png',
};

// =============================================================================
// Daqui para baixo não precisa mexer.
// =============================================================================
(function () {
  const CFG = window.CLUBE_CONFIG;
  CFG.nomeCompleto = 'Clube de Desbravadores ' + CFG.nomeClube;
  const partesNome = CFG.appNome.trim().split(/\s+/);
  CFG.appNome1 = partesNome[0] || '';
  CFG.appNome2 = partesNome.slice(1).join(' ');
  CFG.urlPublicaApp = (CFG.urlPublica || location.origin).replace(/\/+$/, '') + '/index.html';
  CFG.linhaClube = 'Clube: ' + CFG.nomeClube + (CFG.codigoClube ? ' (Código ' + CFG.codigoClube + ')' : '');
  CFG.configurado = CFG.supabaseUrl.indexOf('COLE_AQUI') === -1 && CFG.supabaseAnonKey.indexOf('COLE_AQUI') === -1;

  // ---------------------------------------------------------------------------
  // Unidades: vêm da tabela `unidades` do Supabase (a diretoria cadastra em
  // Unidades → "+ Nova unidade"). Os arrays/objetos abaixo são "vivos": o resto
  // do app guarda a referência e eles são atualizados no lugar quando a lista
  // muda — e o evento `clube:unidades` avisa quem precisa redesenhar.
  // ---------------------------------------------------------------------------
  const CACHE_KEY = 'clube:unidades:' + CFG.supabaseUrl;
  const nomes = [];          // todas as unidades (inclusive inativas), em ordem
  const cores = {};          // nome -> cor (green, blue, gold, purple, red, orange, gray)
  const emblemas = {};       // nome -> imagem (data URL ou endereço), quando cadastrada
  const status = {};         // nome -> 'ativa' | 'andamento' | 'pausada' | 'inativa'
  let carregadas = false;

  function aplicar(lista) {
    nomes.splice(0, nomes.length, ...lista.map((u) => u.nome));
    [cores, emblemas, status].forEach((o) => Object.keys(o).forEach((k) => delete o[k]));
    lista.forEach((u) => {
      cores[u.nome] = u.cor || 'gray';
      status[u.nome] = u.status || 'ativa';
      if (u.emblema) emblemas[u.nome] = u.emblema;
    });
  }

  try {
    const salvo = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (Array.isArray(salvo)) aplicar(salvo);
  } catch (e) { /* sem cache */ }

  function avisar() {
    preencherSelects();
    window.dispatchEvent(new CustomEvent('clube:unidades', { detail: nomes.slice() }));
  }

  async function recarregar() {
    if (!CFG.configurado) return nomes;
    try {
      const url = CFG.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/unidades?select=*&order=ordem.asc,nome.asc';
      const r = await fetch(url, { headers: { apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey } });
      if (!r.ok) return nomes;
      const lista = await r.json();
      const antes = JSON.stringify(nomes) + JSON.stringify(cores) + JSON.stringify(status) + Object.keys(emblemas).join();
      aplicar(lista);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(lista)); } catch (e) { /* ok */ }
      const depois = JSON.stringify(nomes) + JSON.stringify(cores) + JSON.stringify(status) + Object.keys(emblemas).join();
      carregadas = true;
      if (antes !== depois) avisar();
    } catch (e) { /* offline: fica com o cache */ }
    return nomes;
  }

  // <select data-unidades> recebe as unidades ativas. Opções fixas (placeholder,
  // "Diretoria do Clube" etc.) ficam no HTML; as marcadas com data-fim vão pro final.
  function preencherSelects(raiz) {
    (raiz || document).querySelectorAll('select[data-unidades]').forEach((sel) => {
      const valor = sel.value;
      sel.querySelectorAll('option[data-un]').forEach((o) => o.remove());
      const fim = sel.querySelector('option[data-fim]');
      const incluirInativas = sel.hasAttribute('data-unidades-todas');
      nomes.forEach((nome) => {
        if (!incluirInativas && status[nome] === 'inativa') return;
        const o = document.createElement('option');
        o.value = nome;
        o.textContent = nome;
        o.dataset.un = '1';
        sel.insertBefore(o, fim);
      });
      if (valor && [...sel.options].some((o) => o.value === valor)) sel.value = valor;
    });
  }

  // Textos com o nome do clube/app: <span data-clube="nomeClube"></span> etc.
  // data-clube-maiusculo deixa em CAIXA ALTA.
  function preencherTextos() {
    document.querySelectorAll('[data-clube]').forEach((el) => {
      const v = CFG[el.getAttribute('data-clube')];
      if (v == null) return;
      el.textContent = el.hasAttribute('data-clube-maiusculo') ? String(v).toLocaleUpperCase('pt-BR') : v;
    });
    document.title = document.title.replace('Clube Digital', CFG.appNome);
    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (meta) meta.content = CFG.appNome;
  }

  // Logo: as <img data-logo-clube> começam apontando para o arquivo e, logo em
  // seguida, passam a usar a versão "embutida" (data URL) — os PDFs (jsPDF)
  // precisam dela assim.
  function prepararLogo() {
    const imgs = document.querySelectorAll('img[data-logo-clube]');
    imgs.forEach((img) => { if (!img.getAttribute('src')) img.src = CFG.logo; });
    fetch(CFG.logo)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!b) return;
        const fr = new FileReader();
        fr.onload = () => {
          CFG.logoDataUrl = fr.result;
          document.querySelectorAll('img[data-logo-clube]').forEach((img) => { img.src = fr.result; });
        };
        fr.readAsDataURL(b);
      })
      .catch(() => {});
  }

  window.CLUBE = {
    config: CFG,
    unidades: nomes,
    cores,
    emblemas,
    status,
    get carregadas() { return carregadas; },
    recarregar,
    preencherSelects,
  };

  function iniciar() {
    preencherTextos();
    prepararLogo();
    preencherSelects();
    recarregar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();

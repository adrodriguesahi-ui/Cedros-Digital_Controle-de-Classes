-- Cedros Digital — Storage de arquivos (fotos, documentos)
-- Rode este script no SQL Editor do Supabase, depois de rodar o schema.sql.
--
-- Por que separado do banco: o Postgres (schema.sql) tem cota de 500MB no
-- plano free. Arquivos (fotos, PDFs) NUNCA devem ser guardados como base64
-- numa coluna de tabela — isso estoura o banco rapidíssimo. O Supabase
-- Storage tem cota própria de 1GB, separada do banco, feita exatamente
-- pra isso. O banco só guarda o caminho (texto) de cada arquivo.

-- ---------------------------------------------------------------------
-- bucket público 'arquivos' — mesma política de acesso aberto (anon) já
-- usada nas outras tabelas, já que ainda não há login real (ver
-- disclaimer em schema.sql). Revisar para bucket privado quando houver
-- auth de verdade, especialmente por causa de fotos de menores de idade.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('arquivos', 'arquivos', true, 5242880) -- limite de 5MB por arquivo
on conflict (id) do nothing;

drop policy if exists "arquivos: leitura publica" on storage.objects;
create policy "arquivos: leitura publica" on storage.objects
  for select using (bucket_id = 'arquivos');

drop policy if exists "arquivos: upload publico" on storage.objects;
create policy "arquivos: upload publico" on storage.objects
  for insert with check (bucket_id = 'arquivos');

drop policy if exists "arquivos: remocao publica" on storage.objects;
create policy "arquivos: remocao publica" on storage.objects
  for delete using (bucket_id = 'arquivos');

-- ---------------------------------------------------------------------
-- arquivos: metadados de cada upload em galeria (o arquivo em si vive no
-- Storage, aqui só o caminho). `contexto` identifica de onde veio o
-- upload: 'unidade_cantinho' (fotos do Cantinho da Unidade) ou
-- 'evento_doc' (documentos anexados a um evento). `referencia` é o nome
-- da unidade ou do evento.
-- ---------------------------------------------------------------------
create table if not exists arquivos (
  id uuid primary key default gen_random_uuid(),
  contexto text not null,
  referencia text not null, -- ex.: nome da unidade, do evento
  nome_original text not null,
  caminho text not null, -- caminho no bucket 'arquivos'
  tipo text not null, -- mime type
  tamanho int not null, -- bytes
  created_at timestamptz not null default now()
);

alter table arquivos enable row level security;

drop policy if exists "arquivos: acesso publico" on arquivos;
create policy "arquivos: acesso publico" on arquivos
  for all using (true) with check (true);

-- ---------------------------------------------------------------------
-- atividades_classe: atividades/requisitos extras cadastrados em
-- Classes Regulares (botão "+ Nova Atividade"). O currículo padrão já
-- vem fixo no HTML — esta tabela só guarda os itens adicionados/editados
-- manualmente, para persistirem entre sessões e dispositivos. A foto usa
-- colunas próprias (1 foto por atividade) em vez da tabela `arquivos`.
-- ---------------------------------------------------------------------
create table if not exists atividades_classe (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  classe text not null,
  area text not null default 'Vida em Sociedade',
  status text not null default 'todo',
  status_label text not null default '',
  status_color text not null default 'gray',
  descricao text,
  foto_caminho text, -- caminho no bucket 'arquivos', null se sem foto
  foto_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table atividades_classe enable row level security;

drop policy if exists "atividades_classe: acesso publico" on atividades_classe;
create policy "atividades_classe: acesso publico" on atividades_classe
  for all using (true) with check (true);

-- ---------------------------------------------------------------------
-- banners_home: destaques extras do carrossel na tela Início (botão "+"
-- no canto do carrossel, só visível pra Administrador/Diretoria
-- Executiva). Os 4 banners fixos que já vêm no HTML continuam intocados;
-- esta tabela só guarda os adicionados manualmente. A foto é opcional —
-- sem foto, o destaque usa um fundo em degradê + ícone, como os banners
-- fixos sem imagem.
-- ---------------------------------------------------------------------
create table if not exists banners_home (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  data date not null,
  hora text,
  local text not null default 'Sede do Clube',
  imagem_caminho text, -- caminho no bucket 'arquivos', null se sem imagem
  imagem_url text,
  created_at timestamptz not null default now()
);

alter table banners_home enable row level security;

drop policy if exists "banners_home: acesso publico" on banners_home;
create policy "banners_home: acesso publico" on banners_home
  for all using (true) with check (true);

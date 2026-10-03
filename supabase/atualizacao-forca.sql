-- Jogo da Forca (Desafio Só Desbravador). Só acrescenta tabelas novas; pode
-- rodar mais de uma vez sem problema. Rode no SQL Editor do Supabase.

-- Palavras que o clube cadastra (personagens bíblicos, nós, termos do clube).
-- Os nomes de especialidades não ficam aqui: saem do catálogo do próprio app.
create table if not exists forca_palavras (
  id uuid primary key default gen_random_uuid(),
  palavra text not null,
  dica text,
  ativa boolean not null default true,
  criado_por text,
  created_at timestamptz not null default now()
);
alter table forca_palavras enable row level security;
drop policy if exists p_forca_palavras on forca_palavras;
create policy p_forca_palavras on forca_palavras for all using(true) with check(true);

-- Uma linha por rodada jogada. O ranking "Seja Destaque" usa só a melhor de
-- cada pessoa, como na Trilha do Saber.
create table if not exists forca_partidas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  palavras int not null default 0,
  pontos int not null default 0,
  created_at timestamptz not null default now()
);
alter table forca_partidas enable row level security;
drop policy if exists p_forca_partidas on forca_partidas;
create policy p_forca_partidas on forca_partidas for all using(true) with check(true);

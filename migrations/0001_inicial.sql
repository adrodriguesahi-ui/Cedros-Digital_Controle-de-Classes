-- Cedros Digital · Controle de Classes
-- Estrutura inicial do banco (Cloudflare D1 / SQLite)

CREATE TABLE unidades (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT NOT NULL UNIQUE,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE usuarios (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  -- 'admin' = diretoria (acesso total); 'conselheiro' = conselheiro/instrutor
  papel      TEXT NOT NULL DEFAULT 'conselheiro' CHECK (papel IN ('admin', 'conselheiro')),
  -- Se preenchido, o conselheiro só vê os desbravadores desta unidade
  unidade_id INTEGER REFERENCES unidades(id) ON DELETE SET NULL,
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessoes (
  token      TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em  TEXT NOT NULL
);

CREATE TABLE classes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nome         TEXT NOT NULL UNIQUE,
  ordem        INTEGER NOT NULL,
  idade_minima INTEGER,
  cor          TEXT NOT NULL DEFAULT '#1f5f3a'
);

CREATE TABLE requisitos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  classe_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  secao     TEXT NOT NULL DEFAULT 'Gerais',
  ordem     INTEGER NOT NULL DEFAULT 0,
  descricao TEXT NOT NULL
);
CREATE INDEX idx_requisitos_classe ON requisitos(classe_id, ordem);

CREATE TABLE desbravadores (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT NOT NULL,
  data_nascimento TEXT,
  unidade_id      INTEGER REFERENCES unidades(id) ON DELETE SET NULL,
  classe_id       INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  observacoes     TEXT,
  ativo           INTEGER NOT NULL DEFAULT 1,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_desbravadores_classe ON desbravadores(classe_id);
CREATE INDEX idx_desbravadores_unidade ON desbravadores(unidade_id);

CREATE TABLE progresso (
  desbravador_id INTEGER NOT NULL REFERENCES desbravadores(id) ON DELETE CASCADE,
  requisito_id   INTEGER NOT NULL REFERENCES requisitos(id) ON DELETE CASCADE,
  concluido_em   TEXT NOT NULL DEFAULT (date('now')),
  registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  PRIMARY KEY (desbravador_id, requisito_id)
);

-- Classes regulares (idade mínima e cor de cada classe)
INSERT INTO classes (nome, ordem, idade_minima, cor) VALUES
  ('Amigo',         1, 10, '#1e5bb8'),
  ('Companheiro',   2, 11, '#c62828'),
  ('Pesquisador',   3, 12, '#2e7d32'),
  ('Pioneiro',      4, 13, '#6b7280'),
  ('Excursionista', 5, 14, '#6a1b9a'),
  ('Guia',          6, 15, '#c99700');

/**
 * Estrutura do banco. O Worker cria as tabelas sozinho na primeira requisição
 * (CREATE TABLE IF NOT EXISTS), então basta criar um banco D1 vazio e ligá-lo ao app.
 * Para mudar a estrutura no futuro, acrescente comandos no fim desta lista
 * (ex.: ALTER TABLE) de forma que possam rodar mais de uma vez sem erro.
 */
export const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS unidades (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT NOT NULL UNIQUE,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
)`,
  `CREATE TABLE IF NOT EXISTS usuarios (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  papel      TEXT NOT NULL DEFAULT 'conselheiro' CHECK (papel IN ('admin', 'conselheiro')),
  unidade_id INTEGER REFERENCES unidades(id) ON DELETE SET NULL,
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
)`,
  `CREATE TABLE IF NOT EXISTS sessoes (
  token      TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em  TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS classes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nome         TEXT NOT NULL UNIQUE,
  ordem        INTEGER NOT NULL,
  idade_minima INTEGER,
  cor          TEXT NOT NULL DEFAULT '#1f5f3a'
)`,
  `CREATE TABLE IF NOT EXISTS requisitos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  classe_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  secao     TEXT NOT NULL DEFAULT 'Gerais',
  ordem     INTEGER NOT NULL DEFAULT 0,
  descricao TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_requisitos_classe ON requisitos(classe_id, ordem)`,
  `CREATE TABLE IF NOT EXISTS desbravadores (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT NOT NULL,
  data_nascimento TEXT,
  unidade_id      INTEGER REFERENCES unidades(id) ON DELETE SET NULL,
  classe_id       INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  observacoes     TEXT,
  ativo           INTEGER NOT NULL DEFAULT 1,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now'))
)`,
  `CREATE INDEX IF NOT EXISTS idx_desbravadores_classe ON desbravadores(classe_id)`,
  `CREATE INDEX IF NOT EXISTS idx_desbravadores_unidade ON desbravadores(unidade_id)`,
  `CREATE TABLE IF NOT EXISTS progresso (
  desbravador_id INTEGER NOT NULL REFERENCES desbravadores(id) ON DELETE CASCADE,
  requisito_id   INTEGER NOT NULL REFERENCES requisitos(id) ON DELETE CASCADE,
  concluido_em   TEXT NOT NULL DEFAULT (date('now')),
  registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  PRIMARY KEY (desbravador_id, requisito_id)
)`,
  `INSERT OR IGNORE INTO classes (nome, ordem, idade_minima, cor) VALUES
  ('Amigo',         1, 10, '#1e5bb8'),
  ('Companheiro',   2, 11, '#c62828'),
  ('Pesquisador',   3, 12, '#2e7d32'),
  ('Pioneiro',      4, 13, '#6b7280'),
  ('Excursionista', 5, 14, '#6a1b9a'),
  ('Guia',          6, 15, '#c99700')`,
];

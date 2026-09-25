// Simulação mínima do Cloudflare D1 usando node:sqlite (Node 22+).
// Usada só para testes locais sem o wrangler. Não vai para produção.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

class Stmt {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Stmt(this.db, this.sql, params);
  }
  _p() {
    return this.params.map((v) => (typeof v === 'boolean' ? Number(v) : v === undefined ? null : v));
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this._p()).map((r) => ({ ...r })) };
  }
  async first() {
    const r = this.db.prepare(this.sql).get(...this._p());
    return r ? { ...r } : null;
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this._p());
    return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } };
  }
}

export function criarD1(arquivo = ':memory:', pastaMigracoes) {
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA foreign_keys = ON');
  if (pastaMigracoes) {
    db.exec('CREATE TABLE IF NOT EXISTS _migracoes (nome TEXT PRIMARY KEY)');
    for (const f of readdirSync(pastaMigracoes).filter((f) => f.endsWith('.sql')).sort()) {
      if (db.prepare('SELECT 1 FROM _migracoes WHERE nome = ?').get(f)) continue;
      db.exec(readFileSync(join(pastaMigracoes, f), 'utf8'));
      db.prepare('INSERT INTO _migracoes VALUES (?)').run(f);
    }
  }
  return {
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

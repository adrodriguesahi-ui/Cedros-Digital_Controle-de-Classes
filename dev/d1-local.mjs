// Simulação mínima do Cloudflare D1 usando node:sqlite (Node 22+).
// Usada só para testes locais sem o wrangler. Não vai para produção.
import { DatabaseSync } from 'node:sqlite';

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

export function criarD1(arquivo = ':memory:') {
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA foreign_keys = ON');
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

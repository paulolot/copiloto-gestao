/**
 * T1.2 — Board and code sync into SQLite (RF-01, RF-02)
 * First load: everything open plus the last 12 weeks. After that, only what changed since the last sync.
 * Writes are upserts, so running twice is harmless.
 */
import type { Database } from 'sql.js';
import { persist } from '../db/database.js';
import type { AzdoClient } from './client.js';
import type { TimeEscopo } from './escopo.js';

const SEMANAS_INICIAIS = 12;

export interface SyncResultado {
  time: string;
  workItems: number;
  commits: number;
  pullRequests: number;
  incremental: boolean;
}

const iso = (d: Date) => d.toISOString();

export async function sincronizarTime(db: Database, client: AzdoClient, time: TimeEscopo, agora = new Date()): Promise<SyncResultado> {
  const est = db.exec('SELECT ultimo_sync FROM sync_estado WHERE time_id = ?', [time.id])[0]?.values[0]?.[0] as string | undefined;
  const incremental = !!est;
  const desde = est
    ? iso(new Date(new Date(est).getTime() - 86_400_000)) // one day of overlap against clock skew
    : iso(new Date(agora.getTime() - SEMANAS_INICIAIS * 7 * 86_400_000));

  // Commits are counted per whole day, so the window must start at midnight or the first day would be partial.
  const inicioDoDia = `${desde.slice(0, 10)}T00:00:00Z`;

  try {
    const ids = await client.consultarIds(time.projeto, time.areaPath, { desde, apenasAlterados: incremental });
    const itens = await client.workItems(ids);
    const iteracoes = await client.iteracoes(time.projeto);
    const commits = new Map<string, number>();
    const prs: { repo: string; id: number; estado: string; criadoEm: string; fechadoEm?: string }[] = [];
    let totalCommits = 0;
    for (const r of time.repos) {
      for (const c of await client.commits(r.projeto, r.repo, inicioDoDia)) {
        const k = `${r.repo}|${c.data.slice(0, 10)}`;
        commits.set(k, (commits.get(k) ?? 0) + 1);
        totalCommits++;
      }
      for (const p of await client.pullRequests(r.projeto, r.repo)) prs.push({ repo: r.repo, ...p });
    }

    db.run('BEGIN');
    try {
      for (const w of itens) {
        db.run(
          `INSERT INTO work_items (id, time_id, tipo, estado, titulo, iteration_path, criado_em, alterado_em,
             mudanca_estado_em, ativado_em, fechado_em, pontos, tags, tem_dono, paralisado, tipo_bug, coluna, dono)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET time_id=excluded.time_id, tipo=excluded.tipo, estado=excluded.estado, titulo=excluded.titulo,
             iteration_path=excluded.iteration_path, criado_em=excluded.criado_em, alterado_em=excluded.alterado_em,
             mudanca_estado_em=excluded.mudanca_estado_em, ativado_em=excluded.ativado_em, fechado_em=excluded.fechado_em,
             pontos=excluded.pontos, tags=excluded.tags, tem_dono=excluded.tem_dono, paralisado=excluded.paralisado,
             tipo_bug=excluded.tipo_bug, coluna=excluded.coluna, dono=excluded.dono`,
          [w.id, time.id, w.tipo, w.estado, w.titulo, w.iterationPath, w.criadoEm, w.alteradoEm, w.mudancaEstadoEm ?? null,
            w.ativadoEm ?? null, w.fechadoEm ?? null, w.pontos ?? null, w.tags.join(';'), w.temDono ? 1 : 0, w.paralisado ? 1 : 0,
            w.tipoBug ?? null, w.coluna ?? null, w.dono ?? null],
        );
      }
      for (const i of iteracoes) {
        db.run('INSERT OR REPLACE INTO iteracoes (time_id, caminho, nome, inicio, fim) VALUES (?,?,?,?,?)',
          [time.id, i.caminho, i.nome, i.inicio ?? null, i.fim ?? null]);
      }
      // A day is rewritten as a whole: the fetch window always covers full days from `desde`.
      for (const [k, qtd] of commits) {
        const [repo, dia] = k.split('|');
        db.run('INSERT OR REPLACE INTO commits_dia (time_id, repo, dia, qtd) VALUES (?,?,?,?)', [time.id, repo, dia, qtd]);
      }
      for (const p of prs) {
        db.run('INSERT OR REPLACE INTO pull_requests (time_id, repo, id, estado, criado_em, fechado_em) VALUES (?,?,?,?,?,?)',
          [time.id, p.repo, p.id, p.estado, p.criadoEm, p.fechadoEm ?? null]);
      }
      db.run(
        `INSERT INTO sync_estado (time_id, ultimo_sync, ultimo_erro) VALUES (?,?,NULL)
         ON CONFLICT(time_id) DO UPDATE SET ultimo_sync = excluded.ultimo_sync, ultimo_erro = NULL`,
        [time.id, iso(agora)],
      );
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
    await completarMarcos(db, client, time.id, agora);
    persist(db);
    return { time: time.id, workItems: itens.length, commits: totalCommits, pullRequests: prs.length, incremental };
  } catch (e) {
    db.run(
      `INSERT INTO sync_estado (time_id, ultimo_erro) VALUES (?,?)
       ON CONFLICT(time_id) DO UPDATE SET ultimo_erro = excluded.ultimo_erro`,
      [time.id, (e as Error).message],
    );
    persist(db);
    throw e;
  }
}

const MAX_REVISOES_POR_SYNC = 300;

/**
 * Lead and cycle time need dates the work item does not hold (when it entered Backlog, Fazendo Análise,
 * Pronto pra release): they come from the revisions. Only items that reached Resolved or Closed need them,
 * and each is fetched once. A failure on one item never fails the sync; it is tried again on the next run
 * (meanwhile the metrics fall back to creation, activation and state-change dates).
 */
async function completarMarcos(db: Database, client: AzdoClient, timeId: string, agora: Date): Promise<void> {
  const ids = (db.exec(
    `SELECT id FROM work_items WHERE time_id = ? AND estado IN ('Resolved','Closed','Done') AND marcos_em IS NULL
       ORDER BY alterado_em DESC LIMIT ${MAX_REVISOES_POR_SYNC}`, [timeId])[0]?.values ?? []).map((v) => v[0] as number);
  for (const id of ids) {
    try {
      const m = await client.marcos(id);
      db.run('UPDATE work_items SET backlog_em = ?, analise_em = ?, pronto_em = ?, marcos_em = ? WHERE id = ?',
        [m.backlogEm ?? null, m.analiseEm ?? null, m.prontoEm ?? null, agora.toISOString(), id]);
    } catch {
      // keep going; retried next time
    }
  }
}

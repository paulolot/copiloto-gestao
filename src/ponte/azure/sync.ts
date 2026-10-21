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
          `INSERT OR REPLACE INTO work_items (id, time_id, tipo, estado, titulo, iteration_path, criado_em, alterado_em,
             mudanca_estado_em, ativado_em, fechado_em, pontos, tags, tem_dono, dono)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [w.id, time.id, w.tipo, w.estado, w.titulo, w.iterationPath, w.criadoEm, w.alteradoEm, w.mudancaEstadoEm ?? null,
            w.ativadoEm ?? null, w.fechadoEm ?? null, w.pontos ?? null, w.tags.join(';'), w.temDono ? 1 : 0, w.dono ?? null],
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

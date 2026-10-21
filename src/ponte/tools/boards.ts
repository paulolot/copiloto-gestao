/**
 * T1.5 — Board tools (read only, level `sozinho`)
 * Pure functions that return the JSON text a tool sends back. Every answer carries `fonte`
 * (Azure DevOps area path and last sync) so the agent can cite it, and none carries a person's name.
 */
import type { Database } from 'sql.js';
import type { AzdoClient } from '../azure/client.js';
import { colunaDesconhecida } from '../azure/colunas.js';
import { acharTime, timesAtivos, type TimeEscopo } from '../azure/escopo.js';
import { sincronizarTime } from '../azure/sync.js';
import { metricasColaboradores } from '../azure/metricas-pessoa.js';
import { prefixoRoadmap, roadmaps } from '../azure/roadmap.js';
import { avaliarTime, itensProblema, sinaisAtivos, type TipoProblema } from '../azure/alertas.js';

export interface BoardsDeps {
  db: Database;
  azdo?: AzdoClient;
}

function resolverTimes(time?: string): TimeEscopo[] {
  if (!time) return timesAtivos();
  const t = acharTime(time);
  if (!t) throw new Error(`Time desconhecido: "${time}". Use: ${timesAtivos().map((x) => x.id).join(', ')}`);
  return [t];
}

function fonte(db: Database, t: TimeEscopo) {
  const ultimo = db.exec('SELECT ultimo_sync, ultimo_erro FROM sync_estado WHERE time_id = ?', [t.id])[0]?.values[0];
  // Board columns the code does not recognize (a typo, a rename, a column only this team has): their items
  // are placed by state, so the numbers may be off until the name is added in azure/colunas.ts.
  const colunasDesconhecidas = (db.exec('SELECT DISTINCT coluna FROM work_items WHERE time_id = ? AND coluna IS NOT NULL', [t.id])[0]?.values ?? [])
    .map((v) => v[0] as string).filter(colunaDesconhecida).sort();
  return { sistema: 'Azure DevOps', areaPath: t.areaPath, sincronizadoEm: (ultimo?.[0] as string) ?? null, ultimoErro: (ultimo?.[1] as string) ?? null, colunasDesconhecidas };
}

function exigirDados(db: Database, t: TimeEscopo): void {
  const f = fonte(db, t);
  if (!f.sincronizadoEm) throw new Error(`Time ${t.nome} ainda não foi sincronizado. Chame boards_sincronizar primeiro.`);
}

export async function boardsSincronizar(deps: BoardsDeps, time?: string): Promise<string> {
  if (!deps.azdo) throw new Error('Azure DevOps não configurado (AZDO_PAT e AZDO_ORG ausentes). Veja docs/conectar.md.');
  const out = [];
  for (const t of resolverTimes(time)) out.push(await sincronizarTime(deps.db, deps.azdo, t));
  return JSON.stringify(out, null, 2);
}

export function boardsSaude(db: Database, time?: string, agora = new Date()): string {
  return JSON.stringify(resolverTimes(time).map((t) => {
    exigirDados(db, t);
    const { metricas, sinais } = avaliarTime(db, t.id, agora);
    return { time: t.nome, fonte: fonte(db, t), metricas, sinaisAtivos: sinais.ativos };
  }), null, 2);
}

export function boardsAlertas(db: Database, time?: string, agora = new Date()): string {
  return JSON.stringify(resolverTimes(time).map((t) => {
    exigirDados(db, t);
    avaliarTime(db, t.id, agora);
    return { time: t.nome, fonte: fonte(db, t), sinais: sinaisAtivos(db, t.id) };
  }), null, 2);
}

export function boardsItensProblema(db: Database, time: string, tipo: TipoProblema, agora = new Date()): string {
  const [t] = resolverTimes(time);
  exigirDados(db, t);
  return JSON.stringify({ time: t.nome, tipo, fonte: fonte(db, t), itens: itensProblema(db, t.id, tipo, agora) }, null, 2);
}

/** `atual` recomputes now; `historico` returns the stored snapshots (RF-03). */
export function metricasTime(db: Database, time: string, periodo: 'atual' | 'historico', agora = new Date()): string {
  const [t] = resolverTimes(time);
  exigirDados(db, t);
  if (periodo === 'atual') return JSON.stringify({ time: t.nome, fonte: fonte(db, t), metricas: avaliarTime(db, t.id, agora).metricas }, null, 2);
  const linhas = db.exec('SELECT periodo, metrica, valor FROM metric_snapshots WHERE time_id = ? ORDER BY periodo, metrica', [t.id])[0]?.values ?? [];
  const hist: Record<string, Record<string, number>> = {};
  for (const [p, m, v] of linhas) (hist[p as string] ??= {})[m as string] = v as number;
  return JSON.stringify({ time: t.nome, fonte: fonte(db, t), historico: hist }, null, 2);
}

/**
 * Per-collaborator metrics (restricted). `pessoa` filters by part of the name or e-mail;
 * without it, everyone in the team(s) is returned, alphabetically.
 */
export function metricasColaborador(db: Database, opts: { time?: string; pessoa?: string }, agora = new Date()): string {
  const times = resolverTimes(opts.time);
  times.forEach((t) => exigirDados(db, t));
  const r = metricasColaboradores(db, { timeIds: times.map((t) => t.id), pessoa: opts.pessoa, agora });
  if (opts.pessoa && !r.colaboradores.length) throw new Error('Nenhum colaborador com itens atribuídos corresponde a essa busca');
  return JSON.stringify({ fonte: times.map((t) => fonte(db, t)), ...r }, null, 2);
}

/** Progress of the roadmaps marked by tag (the teams have no sprints). */
export function boardsRoadmap(db: Database, opts: { time?: string; tag?: string }, agora = new Date()): string {
  return JSON.stringify(resolverTimes(opts.time).map((t) => {
    exigirDados(db, t);
    const r = roadmaps(db, t.id, { tag: opts.tag, agora });
    return {
      time: t.nome, fonte: fonte(db, t), roadmaps: r,
      ...(r.length ? {} : { aviso: `Nenhum item com tag que comece por "${prefixoRoadmap()}". A tag usada nos roadmaps é configurada em AZDO_TAG_ROADMAP.` }),
    };
  }), null, 2);
}

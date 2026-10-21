/**
 * T1.5 — Board tools (read only, level `sozinho`)
 * Pure functions that return the JSON text a tool sends back. Every answer carries `fonte`
 * (Azure DevOps area path and last sync) so the agent can cite it, and none carries a person's name.
 */
import type { Database } from 'sql.js';
import type { AzdoClient } from '../azure/client.js';
import { acharTime, timesAtivos, type TimeEscopo } from '../azure/escopo.js';
import { sincronizarTime } from '../azure/sync.js';
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
  return { sistema: 'Azure DevOps', areaPath: t.areaPath, sincronizadoEm: (ultimo?.[0] as string) ?? null, ultimoErro: (ultimo?.[1] as string) ?? null };
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

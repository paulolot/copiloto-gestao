/**
 * T1.6 — Hourly board sync, business days 7h–19h (RNF-01)
 * Each cycle syncs the active teams, evaluates the signals and posts only the new ones to #alertas.
 * A failed sync is also reported, once per distinct error, so a long outage does not flood the channel.
 */
import type { Database } from 'sql.js';
import type { AzdoClient } from './azure/client.js';
import { timesAtivos, type TimeEscopo } from './azure/escopo.js';
import { sincronizarTime } from './azure/sync.js';
import { avaliarTime, marcarAvisado, sinaisNaoAvisados, type SinalRegistrado } from './azure/alertas.js';
import { logAudit } from './db/audit.js';
import type { DiscordCanal } from './tools/discord.js';

export type Postar = (canal: DiscordCanal, texto: string) => Promise<unknown>;

const FUSO = 'America/Sao_Paulo';

/** Monday to Friday, 7h to 19h (19h itself is out) in São Paulo time. */
export function dentroDaJanela(d: Date): boolean {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(d);
  const dia = p.find((x) => x.type === 'weekday')!.value;
  const hora = Number(p.find((x) => x.type === 'hour')!.value);
  return !['Sat', 'Sun'].includes(dia) && hora >= 7 && hora < 19;
}

const dataBr = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' }).format(new Date(iso));

export function formatarSinal(nome: string, s: SinalRegistrado): string {
  const icone = s.severidade === 'vermelho' ? '🔴' : '🟡';
  return `${icone} **${nome}** — ${s.descricao} (desde ${dataBr(s.desde)}) · fonte: Azure DevOps`;
}

export interface CicloDeps {
  db: Database;
  azdo: AzdoClient;
  postar: Postar;
  times?: TimeEscopo[];
  agora?: Date;
}

export interface CicloResultado {
  sincronizados: string[];
  falhas: string[];
  alertasPostados: number;
}

export async function executarCiclo(deps: CicloDeps): Promise<CicloResultado> {
  const { db, azdo, postar } = deps;
  const agora = deps.agora ?? new Date();
  const times = deps.times ?? timesAtivos();
  const res: CicloResultado = { sincronizados: [], falhas: [], alertasPostados: 0 };

  for (const t of times) {
    const inicio = Date.now();
    const erroAnterior = db.exec('SELECT ultimo_erro FROM sync_estado WHERE time_id = ?', [t.id])[0]?.values[0]?.[0] as string | null | undefined;
    try {
      await sincronizarTime(db, azdo, t, agora);
      avaliarTime(db, t.id, agora);
      res.sincronizados.push(t.id);
      logAudit(db, { tool: 'boards_sync_agendado', params: { time: t.id }, origin: 'agendador', result: 'ok', duration_ms: Date.now() - inicio });
    } catch (e) {
      const msg = (e as Error).message;
      res.falhas.push(t.id);
      logAudit(db, { tool: 'boards_sync_agendado', params: { time: t.id }, origin: 'agendador', result: 'error', error_msg: msg, duration_ms: Date.now() - inicio });
      if (erroAnterior !== msg) {
        await postar('alertas', `⚠️ Falha ao sincronizar o Azure DevOps do ${t.nome}: ${msg}`).catch(() => undefined);
      }
    }
  }

  const nomes = new Map(times.map((t) => [t.id, t.nome]));
  for (const s of sinaisNaoAvisados(db)) {
    if (!nomes.has(s.time)) continue;
    try {
      await postar('alertas', formatarSinal(nomes.get(s.time)!, s));
      marcarAvisado(db, s.time, s.chave);
      res.alertasPostados++;
    } catch {
      // Discord unavailable: leave it unannounced, the next cycle tries again.
    }
  }
  return res;
}

/** Runs a cycle now (if inside the window) and then every `intervaloMs`. Returns a stop function. */
export function iniciarAgendador(deps: Omit<CicloDeps, 'agora'>, intervaloMs = 3_600_000, relogio: () => Date = () => new Date()): () => void {
  let rodando = false;
  const tick = async () => {
    if (rodando || !dentroDaJanela(relogio())) return;
    rodando = true;
    try {
      await executarCiclo({ ...deps, agora: relogio() });
    } catch (e) {
      console.error('Erro no ciclo de boards:', (e as Error).message);
    } finally {
      rodando = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervaloMs);
  timer.unref();
  return () => clearInterval(timer);
}

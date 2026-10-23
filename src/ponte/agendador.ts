/**
 * T1.6 — Hourly board sync, business days 7h–17h (RNF-01)
 * Each cycle syncs the active teams, evaluates the signals and posts only the new ones to #alertas.
 * A failed sync is also reported, once per distinct error, so a long outage does not flood the channel.
 */
import type { Database } from 'sql.js';
import type { AzdoClient } from './azure/client.js';
import { timesAtivos, type TimeEscopo } from './azure/escopo.js';
import { sincronizarTime } from './azure/sync.js';
import { sinaisDeMarcos } from './azure/marcos.js';
import { sinaisDeUmAUm, TIME_SINAIS_1X1 } from './tools/um-a-um.js';
import {
  atualizarSinais, avaliarTime, itensDoSinal, marcarAvisado, marcarResolucaoAvisada, sinaisNaoAvisados, sinaisResolvidosNaoAvisados,
  type ItemAviso, type SinalRegistrado, type SinalResolvido,
} from './azure/alertas.js';
import { logAudit } from './db/audit.js';
import type { DiscordCanal } from './tools/discord.js';

export type Postar = (canal: DiscordCanal, texto: string) => Promise<unknown>;

const FUSO = 'America/Sao_Paulo';

/** Monday to Friday, 7h to 17h (17h itself is out; the bridge machine is on only 7h–17h) in São Paulo time. */
export function dentroDaJanela(d: Date): boolean {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(d);
  const dia = p.find((x) => x.type === 'weekday')!.value;
  const hora = Number(p.find((x) => x.type === 'hour')!.value);
  return !['Sat', 'Sun'].includes(dia) && hora >= 7 && hora < 17;
}

const dataBr = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' }).format(new Date(iso));

const MAX_ITENS_NO_AVISO = 8;
const encurtar = (t: string, n = 70) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

export interface DetalheAviso {
  itens?: ItemAviso[];
  resumo?: string;
  /** Builds the work item link; without it the item shows as plain text. */
  link?: (id: number) => string;
}

export function formatarSinal(nome: string, s: SinalRegistrado, d: DetalheAviso = {}): string {
  const icone = s.severidade === 'vermelho' ? '🔴' : '🟡';
  const linhas = [`${icone} **${nome}** — ${s.descricao} (desde ${dataBr(s.desde)}) · fonte: Azure DevOps`];
  const itens = d.itens ?? [];
  for (const i of itens.slice(0, MAX_ITENS_NO_AVISO)) {
    const ref = d.link ? `[#${i.id}](<${d.link(i.id)}>)` : `#${i.id}`;
    const quem = i.responsavel ? ` — ${i.responsavel}` : '';
    const parado = i.dias !== undefined ? ` (${i.dias} d)` : '';
    linhas.push(`• ${ref} ${encurtar(i.titulo)}${quem}${parado}`);
  }
  if (itens.length > MAX_ITENS_NO_AVISO) linhas.push(`… e mais ${itens.length - MAX_ITENS_NO_AVISO} (boards_itens_problema traz a lista toda)`);
  if (d.resumo) linhas.push(...d.resumo.split('\n').map((l) => `• ${l}`));
  return linhas.join('\n');
}

export function formatarResolucao(nome: string, s: SinalResolvido): string {
  return `✅ **${nome}** — resolvido: ${s.descricao} (ativo desde ${dataBr(s.desde)}, resolvido em ${dataBr(s.resolvidoEm)}) · fonte: Azure DevOps`;
}

export interface CicloDeps {
  db: Database;
  azdo: AzdoClient;
  postar: Postar;
  times?: TimeEscopo[];
  agora?: Date;
  /** Organization of the work item links in #alertas; without it the items show without a link. */
  org?: string;
  /** Show who each card belongs to in #alertas (on unless ALERTAS_COM_RESPONSAVEL=nao). */
  comResponsavel?: boolean;
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

  // Milestones at risk use the same dated signals, under the pseudo team "marcos"
  try {
    atualizarSinais(db, 'marcos', sinaisDeMarcos(db, agora), agora);
  } catch (e) {
    logAudit(db, { tool: 'marcos_sinais', origin: 'agendador', result: 'error', error_msg: (e as Error).message });
  }

  // Overdue 1:1s and PDI reviews also become dated signals, under a pseudo team that is never announced in a channel
  if (process.env.VAULT_PATH) {
    try {
      atualizarSinais(db, TIME_SINAIS_1X1, sinaisDeUmAUm(agora), agora);
    } catch (e) {
      logAudit(db, { tool: 'um_a_um_sinais', origin: 'agendador', result: 'error', error_msg: (e as Error).message });
    }
  }

  const nomes = new Map<string, string>([...times.map((t): [string, string] => [t.id, t.nome]), ['marcos', 'Marcos de entrega']]);
  const projetos = new Map(times.map((t) => [t.id, t.projeto]));
  for (const s of sinaisNaoAvisados(db)) {
    if (!nomes.has(s.time)) continue;
    try {
      const projeto = projetos.get(s.time);
      const detalhe: DetalheAviso = projeto ? { ...itensDoSinal(db, s.time, s.chave, agora, !!deps.comResponsavel) } : {};
      if (projeto && deps.org) detalhe.link = (id) => `https://dev.azure.com/${encodeURIComponent(deps.org!)}/${encodeURIComponent(projeto)}/_workitems/edit/${id}`;
      await postar('alertas', formatarSinal(nomes.get(s.time)!, s, detalhe));
      marcarAvisado(db, s.time, s.chave);
      res.alertasPostados++;
    } catch {
      // Discord unavailable: leave it unannounced, the next cycle tries again.
    }
  }
  for (const s of sinaisResolvidosNaoAvisados(db)) {
    if (!nomes.has(s.time)) continue;
    try {
      await postar('alertas', formatarResolucao(nomes.get(s.time)!, s));
      marcarResolucaoAvisada(db, s.time, s.chave);
    } catch {
      // Discord unavailable: the notice stays pending for the next cycle.
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

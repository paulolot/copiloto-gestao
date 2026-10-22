/**
 * T1.3 — Team metrics (RF-03, RF-06)
 * Computed from the synced tables. Everything is per team; owner identities are used only to count
 * WIP in aggregate and never appear in the output (no individual ranking).
 */
import type { Database } from 'sql.js';
import { tiposContados } from './escopo.js';
import { percentis, type Percentis } from './previsao.js';
import { colunaEfetiva, ehIgnorada, emCiclo } from './colunas.js';
import { persist } from '../db/database.js';

// Delivered = column "Concluído" (state Closed). "Pronto pra release" and "Release candidate" (Resolved) are still in the cycle.
export const ESTADOS_PRONTO = ['Closed', 'Done'];
const TAGS_BLOQUEIO = ['blocked', 'bloqueado']; // old convention, still honored next to the Paralisado field
const BUG_EXTERNO = 'bug externo';
const DIA = 86_400_000;

export interface Limites {
  envelhecimentoDias: number;
  bloqueioDiasUteis: number;
  wipPorPessoa: number;
}
export const LIMITES_PADRAO: Limites = { envelhecimentoDias: 7, bloqueioDiasUteis: 2, wipPorPessoa: 3 };

export function limitesDoAmbiente(env: NodeJS.ProcessEnv = process.env): Limites {
  const n = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    envelhecimentoDias: n(env.LIMITE_ENVELHECIMENTO_DIAS, LIMITES_PADRAO.envelhecimentoDias),
    bloqueioDiasUteis: n(env.LIMITE_BLOQUEIO_DIAS_UTEIS, LIMITES_PADRAO.bloqueioDiasUteis),
    wipPorPessoa: n(env.LIMITE_WIP_PESSOA, LIMITES_PADRAO.wipPorPessoa),
  };
}

export interface ItemBoard {
  id: number;
  tipo: string;
  estado: string;
  titulo: string;
  iterationPath: string;
  criadoEm?: string;
  alteradoEm?: string;
  mudancaEstadoEm?: string;
  ativadoEm?: string;
  /** First time in "Fazendo Análise" or later (start of the cycle time). */
  /** From the revisions: Backlog (lead start), Fazendo Análise (cycle start), Pronto pra release (cycle end). */
  backlogEm?: string;
  analiseEm?: string;
  prontoEm?: string;
  coluna?: string;
  fechadoEm?: string;
  pontos?: number;
  tags: string[];
  temDono: boolean;
  paralisado: boolean;
  tipoBug?: string;
  dono?: string;
  donoNome?: string;
}

/** The team has no sprints, so trends are read per calendar month (UTC). */
export interface MetricasMes {
  mes: string;               // 2026-10
  inicio: string;
  fim: string;
  encerrado: boolean;
  criados: number;           // itens criados no mês
  entregues: number;         // itens que chegaram a Concluído no mês
  cycleTimeDias?: number;    // mediana dos que terminaram o ciclo no mês
  leadTimeDias?: number;     // mediana dos entregues no mês
  bugRate?: number;          // bugs (Interno e Externo) criados no mês ÷ User Stories resolvidas (Concluído) no mês, em %
  mttrDias?: number;         // média de Backlog a Concluído dos bugs entregues no mês
  cycleTimeP85?: number;
  leadTimeP85?: number;
  /** DORA, change failure rate (approximation): Bug Externo created in the month ÷ items delivered in the month, in %. */
  taxaFalhaMudanca?: number;
}

/** Bug rate of one period: bugs (Interno and Externo, open or closed) created in it ÷ User Stories resolved (Concluído) in it. */
export interface AmostraBugRate {
  bugs: number;
  userStoriesResolvidas: number;
  taxa?: number; // %
}
/** A rolling window ending now, next to the window of the same length right before it. */
export interface JanelaBugRate {
  dias: number;
  atual: AmostraBugRate;
  anterior: AmostraBugRate;
}
export const JANELAS_BUG_RATE = [7, 30, 90];

export interface MetricasTime {
  time: string;
  geradoEm: string;
  abertos: number;
  envelhecendo: number;
  bloqueados: number;
  bloqueadosAcimaDoLimite: number;
  wipPorColuna: Record<string, number>;
  wipPorPessoa: { maximo: number; pessoasAcimaDoLimite: number };
  bugs: { abertos: number; externosAbertos: number; semDono: number };
  throughputSemanal: { semana: string; entregues: number }[]; // últimas 8 semanas, da mais antiga à atual
  cycleTimeDias?: number;      // mediana dos entregues nos últimos 28 dias
  /** Percentiles over the last 12 weeks (Kanban/DORA style: read P85 as "85% of the items finish within this many days"). */
  cycleTime: Percentis;
  leadTime: Percentis;
  leadTimeDias?: number;
  commitsSemanais: { semana: string; commits: number }[];
  bugRateJanelas: JanelaBugRate[];
  commitsPorRepo: { repo: string; ultimoCommit?: string; commits28Dias: number }[];
  /** Commits dated more than a day ahead of now (a wrong clock or a rebase): left out of every commit figure. */
  commitsComDataFutura: number;
  meses: MetricasMes[];
}

const ms = (s?: string) => (s ? new Date(s).getTime() : NaN);

export function mediana(v: number[]): number | undefined {
  if (!v.length) return undefined;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const r = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  return Math.round(r * 10) / 10;
}

export function media(v: number[]): number | undefined {
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : undefined;
}

/** Weekdays after the day of `de`, up to and including the day of `ate`. */
export function diasUteisEntre(de: Date, ate: Date): number {
  const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let n = 0;
  for (let t = dia(de) + DIA; t <= dia(ate); t += DIA) {
    const w = new Date(t).getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

/** Days since the last change of any kind (the board gives no date for a column move inside a state). */
export const diasSemMudanca = (i: ItemBoard, agora: Date): number =>
  Math.floor((agora.getTime() - ms(i.alteradoEm ?? i.mudancaEstadoEm)) / DIA);

/** ISO week label, e.g. 2026-W43. */
export function semanaIso(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const inicioAno = Date.UTC(t.getUTCFullYear(), 0, 1);
  const sem = Math.ceil(((t.getTime() - inicioAno) / DIA + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(sem).padStart(2, '0')}`;
}

export const ehPronto = (i: ItemBoard) => ESTADOS_PRONTO.includes(i.estado);
/** Only the types on the board count (User Story and Bug); Features, Epics and Atendimentos never do. */
export const contaNasMetricas = (i: { tipo: string }) => tiposContados().some((t) => t.toLowerCase() === i.tipo.trim().toLowerCase());
export const ehBug = (i: ItemBoard) => i.tipo.toLowerCase() === 'bug';
/** Production bug: type Bug with "Tipo Bug" = Bug Externo (a work item type with that name also counts). */
export const ehBugExterno = (i: ItemBoard) => i.tipoBug?.trim().toLowerCase() === BUG_EXTERNO || i.tipo.toLowerCase() === BUG_EXTERNO;
export const ehBloqueado = (i: ItemBoard) => i.paralisado || i.tags.some((t) => TAGS_BLOQUEIO.includes(t.toLowerCase()));
export const dataFechamento = (i: ItemBoard): number => (ehPronto(i) ? ms(i.fechadoEm ?? i.mudancaEstadoEm ?? i.alteradoEm) : NaN);

const ehUserStory = (i: ItemBoard) => i.tipo.trim().toLowerCase() === 'user story';
const taxaBugRate = (bugs: number, userStories: number): number | undefined => (userStories ? Math.round((bugs / userStories) * 1000) / 10 : undefined);

/** Bugs created in (de, ate], of any state (a bug still open counts like a closed one), over User Stories resolved in (de, ate]. */
export function amostraBugRate(itens: ItemBoard[], de: number, ate: number): AmostraBugRate {
  const dentro = (t: number) => t > de && t <= ate;
  const bugs = itens.filter((i) => (ehBug(i) || ehBugExterno(i)) && dentro(ms(i.criadoEm))).length;
  const userStoriesResolvidas = itens.filter((i) => ehUserStory(i) && ehPronto(i) && dentro(dataFechamento(i))).length;
  return { bugs, userStoriesResolvidas, taxa: taxaBugRate(bugs, userStoriesResolvidas) };
}

export function janelasBugRate(itens: ItemBoard[], agora: Date): JanelaBugRate[] {
  const t = agora.getTime();
  return JANELAS_BUG_RATE.map((dias) => ({
    dias,
    atual: amostraBugRate(itens, t - dias * DIA, t),
    anterior: amostraBugRate(itens, t - 2 * dias * DIA, t - dias * DIA),
  }));
}

export function carregarItens(db: Database, timeId: string): ItemBoard[] {
  const r = db.exec(
    `SELECT id, tipo, estado, titulo, iteration_path, criado_em, alterado_em, mudanca_estado_em, ativado_em, fechado_em,
            pontos, tags, tem_dono, dono, paralisado, tipo_bug, coluna, analise_em, backlog_em, pronto_em, dono_nome FROM work_items WHERE time_id = ?`, [timeId]);
  return (r[0]?.values ?? []).map((v): ItemBoard => ({
    id: v[0] as number, tipo: v[1] as string, estado: v[2] as string, titulo: (v[3] as string) ?? '',
    iterationPath: (v[4] as string) ?? '', criadoEm: (v[5] as string) ?? undefined, alteradoEm: (v[6] as string) ?? undefined,
    mudancaEstadoEm: (v[7] as string) ?? undefined, ativadoEm: (v[8] as string) ?? undefined, fechadoEm: (v[9] as string) ?? undefined,
    pontos: (v[10] as number) ?? undefined, tags: ((v[11] as string) ?? '').split(';').filter(Boolean),
    temDono: v[12] === 1, dono: (v[13] as string) ?? undefined,
    paralisado: v[14] === 1, tipoBug: (v[15] as string) ?? undefined,
    coluna: (v[16] as string) ?? undefined, analiseEm: (v[17] as string) ?? undefined,
    backlogEm: (v[18] as string) ?? undefined, prontoEm: (v[19] as string) ?? undefined, donoNome: (v[20] as string) ?? undefined,
  })).filter((i) => !ehIgnorada(i) && contaNasMetricas(i)); // columns Ideias and UX, and types other than User Story/Bug, count in no metric
}

/** Lead time: Backlog to Concluído. */
export const leadDias = (i: ItemBoard) => (dataFechamento(i) - ms(i.backlogEm ?? i.criadoEm)) / DIA;

/** The cycle is over once the item reached Pronto pra release (state Resolved) or Concluído. */
export const terminouOCiclo = (i: ItemBoard) => ehPronto(i) || i.estado === 'Resolved';
/** End of the cycle: first arrival at Pronto pra release; else the state change to Resolved/Closed. */
export const fimCiclo = (i: ItemBoard): number =>
  !terminouOCiclo(i) ? NaN : ms(i.prontoEm ?? (i.estado === 'Resolved' ? i.mudancaEstadoEm : i.fechadoEm ?? i.mudancaEstadoEm) ?? i.alteradoEm);
/** Cycle time: Fazendo Análise to Pronto pra release (or Release candidate). */
export const inicioCiclo = (i: ItemBoard) => ms(i.analiseEm ?? i.ativadoEm ?? i.criadoEm);
export const cycleDias = (i: ItemBoard) => (fimCiclo(i) - inicioCiclo(i)) / DIA;
const validos = (v: number[]) => v.filter((n) => Number.isFinite(n) && n >= 0);

const doMes = (d: Date) => d.toISOString().slice(0, 7);

export function metricasDoMes(itens: ItemBoard[], mes: string, agora: Date): MetricasMes {
  const [ano, m] = mes.split('-').map(Number);
  const inicio = Date.UTC(ano, m - 1, 1);
  const fim = Date.UTC(ano, m, 1);
  const dentro = (t: number) => t >= inicio && t < fim;
  const criados = itens.filter((i) => dentro(ms(i.criadoEm)));
  const entregues = itens.filter((i) => ehPronto(i) && dentro(dataFechamento(i)));
  const bugs = criados.filter((i) => ehBug(i) || ehBugExterno(i)); // Interno and Externo both count
  const bugsEntregues = entregues.filter((i) => ehBug(i) || ehBugExterno(i));
  return {
    mes, inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString(), encerrado: fim <= agora.getTime(),
    criados: criados.length, entregues: entregues.length,
    cycleTimeDias: mediana(validos(itens.filter((i) => terminouOCiclo(i) && dentro(fimCiclo(i))).map(cycleDias))),
    leadTimeDias: mediana(validos(entregues.map(leadDias))),
    bugRate: taxaBugRate(bugs.length, entregues.filter(ehUserStory).length),
    mttrDias: media(validos(bugsEntregues.map(leadDias))),
    cycleTimeP85: percentis(validos(itens.filter((i) => terminouOCiclo(i) && dentro(fimCiclo(i))).map(cycleDias))).p85,
    leadTimeP85: percentis(validos(entregues.map(leadDias))).p85,
    taxaFalhaMudanca: entregues.length ? Math.round((criados.filter(ehBugExterno).length / entregues.length) * 1000) / 10 : undefined,
  };
}

export function calcularMetricas(db: Database, timeId: string, agora = new Date(), limites = limitesDoAmbiente()): MetricasTime {
  const itens = carregarItens(db, timeId);
  const abertos = itens.filter((i) => !ehPronto(i) && i.estado !== 'Removed');

  const envelhecendo = abertos.filter((i) => diasSemMudanca(i, agora) > limites.envelhecimentoDias);
  const bloqueados = abertos.filter(ehBloqueado);
  const bloqueadosAcima = bloqueados.filter((i) => diasUteisEntre(new Date(i.alteradoEm ?? agora), agora) > limites.bloqueioDiasUteis);

  const emAndamento = abertos.filter(emCiclo);
  const wipPorColuna: Record<string, number> = {};
  const porPessoa = new Map<string, number>();
  for (const i of emAndamento) {
    const col = colunaEfetiva(i);
    wipPorColuna[col] = (wipPorColuna[col] ?? 0) + 1;
    if (i.dono) porPessoa.set(i.dono, (porPessoa.get(i.dono) ?? 0) + 1);
  }
  const wips = [...porPessoa.values()];

  const bugsAbertos = abertos.filter((i) => ehBug(i) || ehBugExterno(i));

  const throughputSemanal: MetricasTime['throughputSemanal'] = [];
  const commitsSemanais: MetricasTime['commitsSemanais'] = [];
  const todosCommitsDia = db.exec('SELECT repo, dia, qtd FROM commits_dia WHERE time_id = ?', [timeId])[0]?.values ?? [];
  // One day of tolerance: a commit made in the evening in São Paulo is already "tomorrow" in UTC.
  const limiteCommit = new Date(agora.getTime() + DIA).toISOString().slice(0, 10);
  const commitsDia = todosCommitsDia.filter((c) => (c[1] as string) <= limiteCommit);
  const commitsComDataFutura = todosCommitsDia.filter((c) => (c[1] as string) > limiteCommit).reduce((a, c) => a + (c[2] as number), 0);
  for (let n = 7; n >= 0; n--) {
    const ref = new Date(agora.getTime() - n * 7 * DIA);
    const semana = semanaIso(ref);
    throughputSemanal.push({ semana, entregues: itens.filter((i) => ehPronto(i) && semanaIso(new Date(dataFechamento(i))) === semana).length });
    commitsSemanais.push({ semana, commits: commitsDia.filter((c) => semanaIso(new Date(c[1] as string)) === semana).reduce((a, c) => a + (c[2] as number), 0) });
  }

  const recentes = itens.filter((i) => ehPronto(i) && agora.getTime() - dataFechamento(i) <= 28 * DIA);

  const repos = new Set(commitsDia.map((c) => c[0] as string));
  const commitsPorRepo = [...repos].sort().map((repo) => {
    const dias = commitsDia.filter((c) => c[0] === repo);
    return {
      repo,
      ultimoCommit: dias.map((c) => c[1] as string).sort().pop(),
      commits28Dias: dias.filter((c) => agora.getTime() - ms(c[1] as string) <= 28 * DIA).reduce((a, c) => a + (c[2] as number), 0),
    };
  });

  const meses = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - (5 - k), 1));
    return metricasDoMes(itens, doMes(d), agora);
  }).filter((x) => x.criados > 0 || x.entregues > 0);

  const m: MetricasTime = {
    time: timeId, geradoEm: agora.toISOString(),
    abertos: abertos.length, envelhecendo: envelhecendo.length, bloqueados: bloqueados.length,
    bloqueadosAcimaDoLimite: bloqueadosAcima.length, wipPorColuna,
    wipPorPessoa: { maximo: wips.length ? Math.max(...wips) : 0, pessoasAcimaDoLimite: wips.filter((n) => n > limites.wipPorPessoa).length },
    bugs: {
      abertos: bugsAbertos.length,
      externosAbertos: bugsAbertos.filter(ehBugExterno).length,
      semDono: bugsAbertos.filter((i) => !i.temDono).length,
    },
    throughputSemanal,
    cycleTimeDias: mediana(validos(itens.filter((i) => terminouOCiclo(i) && agora.getTime() - fimCiclo(i) <= 28 * DIA).map(cycleDias))),
    leadTimeDias: mediana(validos(recentes.map(leadDias))),
    cycleTime: percentis(validos(itens.filter((i) => terminouOCiclo(i) && agora.getTime() - fimCiclo(i) <= 84 * DIA).map(cycleDias))),
    leadTime: percentis(validos(itens.filter((i) => ehPronto(i) && agora.getTime() - dataFechamento(i) <= 84 * DIA).map(leadDias))),
    commitsSemanais, bugRateJanelas: janelasBugRate(itens, agora), commitsPorRepo, commitsComDataFutura, meses,
  };
  guardarHistorico(db, m);
  return m;
}

/** Keeps the history (RF-03): weekly numbers and per-month numbers, overwritten while the period is open. */
function guardarHistorico(db: Database, m: MetricasTime): void {
  const grava = (periodo: string, metrica: string, valor: number | undefined) => {
    if (valor === undefined || !Number.isFinite(valor)) return;
    db.run('INSERT OR REPLACE INTO metric_snapshots (time_id, periodo, metrica, valor, calculado_em) VALUES (?,?,?,?,?)',
      [m.time, periodo, metrica, valor, m.geradoEm]);
  };
  m.throughputSemanal.forEach((s) => grava(`semana:${s.semana}`, 'throughput', s.entregues));
  m.commitsSemanais.forEach((s) => grava(`semana:${s.semana}`, 'commits', s.commits));
  for (const x of m.meses) {
    const p = `mes:${x.mes}`;
    grava(p, 'criados', x.criados);
    grava(p, 'entregues', x.entregues);
    grava(p, 'cycle_time', x.cycleTimeDias);
    grava(p, 'lead_time', x.leadTimeDias);
    grava(p, 'bug_rate', x.bugRate);
    grava(p, 'mttr', x.mttrDias);
    grava(p, 'cycle_time_p85', x.cycleTimeP85);
    grava(p, 'lead_time_p85', x.leadTimeP85);
    grava(p, 'taxa_falha_mudanca', x.taxaFalhaMudanca);
  }
  persist(db);
}

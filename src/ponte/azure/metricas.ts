/**
 * T1.3 — Team metrics (RF-03, RF-06)
 * Computed from the synced tables. Everything is per team; owner identities are used only to count
 * WIP in aggregate and never appear in the output (no individual ranking).
 */
import type { Database } from 'sql.js';
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
}

export interface MetricasSprint {
  sprint: string;
  inicio?: string;
  fim?: string;
  encerrada: boolean;
  itens: number;
  entregues: number;
  compromisso?: number;       // % dos itens do início da sprint que ficaram prontos
  escopoAdicionado: number;   // itens criados depois do início
  cycleTimeDias?: number;     // mediana
  leadTimeDias?: number;      // mediana
  bugRate?: number;           // % de Bug Externo entre os itens da sprint
  mttrDias?: number;          // média de abertura a fechamento dos Bug Externo
}

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
  leadTimeDias?: number;
  commitsSemanais: { semana: string; commits: number }[];
  commitsPorRepo: { repo: string; ultimoCommit?: string; commits28Dias: number }[];
  sprints: MetricasSprint[];
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
export const ehBug = (i: ItemBoard) => i.tipo.toLowerCase() === 'bug';
/** Production bug: type Bug with "Tipo Bug" = Bug Externo (a work item type with that name also counts). */
export const ehBugExterno = (i: ItemBoard) => i.tipoBug?.trim().toLowerCase() === BUG_EXTERNO || i.tipo.toLowerCase() === BUG_EXTERNO;
export const ehBloqueado = (i: ItemBoard) => i.paralisado || i.tags.some((t) => TAGS_BLOQUEIO.includes(t.toLowerCase()));
export const dataFechamento = (i: ItemBoard): number => (ehPronto(i) ? ms(i.fechadoEm ?? i.mudancaEstadoEm ?? i.alteradoEm) : NaN);

export function carregarItens(db: Database, timeId: string): ItemBoard[] {
  const r = db.exec(
    `SELECT id, tipo, estado, titulo, iteration_path, criado_em, alterado_em, mudanca_estado_em, ativado_em, fechado_em,
            pontos, tags, tem_dono, dono, paralisado, tipo_bug, coluna, analise_em, backlog_em, pronto_em FROM work_items WHERE time_id = ?`, [timeId]);
  return (r[0]?.values ?? []).map((v): ItemBoard => ({
    id: v[0] as number, tipo: v[1] as string, estado: v[2] as string, titulo: (v[3] as string) ?? '',
    iterationPath: (v[4] as string) ?? '', criadoEm: (v[5] as string) ?? undefined, alteradoEm: (v[6] as string) ?? undefined,
    mudancaEstadoEm: (v[7] as string) ?? undefined, ativadoEm: (v[8] as string) ?? undefined, fechadoEm: (v[9] as string) ?? undefined,
    pontos: (v[10] as number) ?? undefined, tags: ((v[11] as string) ?? '').split(';').filter(Boolean),
    temDono: v[12] === 1, dono: (v[13] as string) ?? undefined,
    paralisado: v[14] === 1, tipoBug: (v[15] as string) ?? undefined,
    coluna: (v[16] as string) ?? undefined, analiseEm: (v[17] as string) ?? undefined,
    backlogEm: (v[18] as string) ?? undefined, prontoEm: (v[19] as string) ?? undefined,
  })).filter((i) => !ehIgnorada(i)); // columns Ideias and UX count in no metric
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

export function metricasDeSprint(itens: ItemBoard[], it: { caminho: string; nome: string; inicio?: string; fim?: string }, agora: Date): MetricasSprint {
  const da = itens.filter((i) => i.iterationPath === it.caminho);
  const inicio = ms(it.inicio);
  const fim = ms(it.fim);
  const noInicio = da.filter((i) => !(ms(i.criadoEm) > inicio + DIA));
  const adicionados = da.length - noInicio.length;
  const prontos = da.filter(ehPronto);
  const bugs = da.filter((i) => ehBug(i) || ehBugExterno(i)); // Interno and Externo both count for bug rate and MTTR
  const encerrada = Number.isFinite(fim) && fim < agora.getTime();
  return {
    sprint: it.nome, inicio: it.inicio, fim: it.fim, encerrada,
    itens: da.length, entregues: prontos.length,
    compromisso: noInicio.length ? Math.round((noInicio.filter(ehPronto).length / noInicio.length) * 100) : undefined,
    escopoAdicionado: adicionados,
    cycleTimeDias: mediana(validos(da.filter(terminouOCiclo).map(cycleDias))),
    leadTimeDias: mediana(validos(prontos.map(leadDias))),
    bugRate: da.length ? Math.round((bugs.length / da.length) * 1000) / 10 : undefined,
    mttrDias: media(validos(bugs.filter(ehPronto).map(leadDias))),
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
  const commitsDia = db.exec('SELECT repo, dia, qtd FROM commits_dia WHERE time_id = ?', [timeId])[0]?.values ?? [];
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

  const iteracoes = (db.exec('SELECT caminho, nome, inicio, fim FROM iteracoes WHERE time_id = ? ORDER BY inicio', [timeId])[0]?.values ?? [])
    .map((v) => ({ caminho: v[0] as string, nome: v[1] as string, inicio: v[2] as string, fim: v[3] as string }))
    .filter((it) => ms(it.inicio) <= agora.getTime());
  const sprints = iteracoes.map((it) => metricasDeSprint(itens, it, agora)).filter((s) => s.itens > 0).slice(-6);

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
    commitsSemanais, commitsPorRepo, sprints,
  };
  guardarHistorico(db, m);
  return m;
}

/** Keeps the history (RF-03): weekly numbers and per-sprint numbers, overwritten while the period is open. */
function guardarHistorico(db: Database, m: MetricasTime): void {
  const grava = (periodo: string, metrica: string, valor: number | undefined) => {
    if (valor === undefined || !Number.isFinite(valor)) return;
    db.run('INSERT OR REPLACE INTO metric_snapshots (time_id, periodo, metrica, valor, calculado_em) VALUES (?,?,?,?,?)',
      [m.time, periodo, metrica, valor, m.geradoEm]);
  };
  m.throughputSemanal.forEach((s) => grava(`semana:${s.semana}`, 'throughput', s.entregues));
  m.commitsSemanais.forEach((s) => grava(`semana:${s.semana}`, 'commits', s.commits));
  for (const s of m.sprints) {
    const p = `sprint:${s.sprint}`;
    grava(p, 'compromisso', s.compromisso);
    grava(p, 'escopo_adicionado', s.escopoAdicionado);
    grava(p, 'cycle_time', s.cycleTimeDias);
    grava(p, 'lead_time', s.leadTimeDias);
    grava(p, 'bug_rate', s.bugRate);
    grava(p, 'mttr', s.mttrDias);
  }
  persist(db);
}

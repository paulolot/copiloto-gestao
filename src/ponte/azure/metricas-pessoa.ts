/**
 * Per-collaborator metrics (decision of 21/10/2026: wanted besides the team metrics)
 * Restricted data about people: only the dedicated tools return it, results are alphabetical
 * (never ordered by performance), and the output says not to rank, compare or post in shared channels.
 * Work is attributed to the item's current owner; reassignments are not tracked.
 */
import type { Database } from 'sql.js';
import { emCiclo } from './colunas.js';
import {
  cycleDias, diasSemMudanca, fimCiclo, leadDias, terminouOCiclo, carregarItens, dataFechamento, ehBloqueado, ehBug, ehBugExterno, ehPronto, limitesDoAmbiente, mediana, semanaIso,
  type ItemBoard, type Limites,
} from './metricas.js';

const DIA = 86_400_000;

export interface MetricasColaborador {
  colaborador: string;
  times: string[];
  abertos: number;
  emAndamento: number;
  wipAcimaDoLimite: boolean;
  envelhecendo: number;
  paralisados: number;
  bugsAbertos: number;
  bugsExternosAbertos: number;
  entregues28Dias: number;
  pontosEntregues28Dias: number;
  cycleTimeDias?: number;
  leadTimeDias?: number;
  entreguesPorSemana: { semana: string; entregues: number }[];
  itensAbertos: { id: number; tipo: string; estado: string; titulo: string; diasNoEstado: number }[];
}

export interface RespostaColaboradores {
  uso: string;
  geradoEm: string;
  colaboradores: MetricasColaborador[];
}

export const AVISO_USO =
  'Dado individual e restrito, para o Paulo usar em 1:1, PDI e acompanhamento. Não ranquear nem comparar pessoas. Entregas contam para o dono atual do item.';

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** A search matches the e-mail (uniqueName) or the display name; every word of the search must appear, in any order. */
function casaComBusca(i: { dono?: string; donoNome?: string }, busca: string): boolean {
  const alvo = semAcento(`${i.dono ?? ''} ${i.donoNome ?? ''}`);
  const b = semAcento(busca).trim();
  return alvo.includes(b) || b.split(/\s+/).every((p) => alvo.includes(p));
}

const ms = (s?: string) => (s ? new Date(s).getTime() : NaN);
const validos = (v: number[]) => v.filter((n) => Number.isFinite(n) && n >= 0);

export function metricasColaboradores(
  db: Database,
  opts: { timeIds: string[]; pessoa?: string; agora?: Date; limites?: Limites },
): RespostaColaboradores {
  const agora = opts.agora ?? new Date();
  const lim = opts.limites ?? limitesDoAmbiente();
  const busca = opts.pessoa?.trim();

  const porPessoa = new Map<string, { itens: ItemBoard[]; times: Set<string> }>();
  for (const t of opts.timeIds) {
    for (const i of carregarItens(db, t)) {
      if (!i.dono) continue;
      if (busca && !casaComBusca(i, busca)) continue;
      const e = porPessoa.get(i.dono) ?? { itens: [], times: new Set<string>() };
      e.itens.push(i);
      e.times.add(t);
      porPessoa.set(i.dono, e);
    }
  }

  const colaboradores = [...porPessoa].map(([nome, { itens, times }]): MetricasColaborador => {
    const abertos = itens.filter((i) => !ehPronto(i) && i.estado !== 'Removed');
    const andamento = abertos.filter(emCiclo);
    const dias = (i: ItemBoard) => diasSemMudanca(i, agora);
    const recentes = itens.filter((i) => ehPronto(i) && agora.getTime() - dataFechamento(i) <= 28 * DIA);
    const semanas = Array.from({ length: 8 }, (_, k) => semanaIso(new Date(agora.getTime() - (7 - k) * 7 * DIA)));
    return {
      colaborador: nome,
      times: [...times].sort(),
      abertos: abertos.length,
      emAndamento: andamento.length,
      wipAcimaDoLimite: andamento.length > lim.wipPorPessoa,
      envelhecendo: abertos.filter((i) => dias(i) > lim.envelhecimentoDias).length,
      paralisados: abertos.filter(ehBloqueado).length,
      bugsAbertos: abertos.filter((i) => ehBug(i) || ehBugExterno(i)).length,
      bugsExternosAbertos: abertos.filter(ehBugExterno).length,
      entregues28Dias: recentes.length,
      pontosEntregues28Dias: recentes.reduce((a, i) => a + (i.pontos ?? 0), 0),
      cycleTimeDias: mediana(validos(itens.filter((i) => terminouOCiclo(i) && agora.getTime() - fimCiclo(i) <= 28 * DIA).map(cycleDias))),
      leadTimeDias: mediana(validos(recentes.map(leadDias))),
      entreguesPorSemana: semanas.map((semana) => ({
        semana,
        entregues: itens.filter((i) => ehPronto(i) && semanaIso(new Date(dataFechamento(i))) === semana).length,
      })),
      itensAbertos: abertos.sort((a, b) => dias(b) - dias(a)).slice(0, 20)
        .map((i) => ({ id: i.id, tipo: i.tipo, estado: i.estado, titulo: i.titulo, diasNoEstado: dias(i) })),
    };
  }).sort((a, b) => a.colaborador.localeCompare(b.colaborador, 'pt-BR'));

  return { uso: AVISO_USO, geradoEm: agora.toISOString(), colaboradores };
}

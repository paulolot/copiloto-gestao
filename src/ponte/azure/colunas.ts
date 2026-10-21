/**
 * Board columns of the three teams (given by Paulo on 21/10/2026), in flow order.
 * The state alone is not enough: "Fazendo Análise" is state New but is where the cycle time starts,
 * so the column decides what is in the cycle, what is WIP and what is out of every metric.
 * A team may lack some columns (Squad Fiscal has no "Release candidate"); the order is what matters.
 */
export const COLUNAS = [
  { nome: 'Ideias', estado: 'New' },
  { nome: 'Backlog', estado: 'New' },
  { nome: 'Fazendo Análise', estado: 'New' },
  { nome: 'Disponível para Dev', estado: 'New' },
  { nome: 'Dev implementando', estado: 'Active' },
  { nome: 'Disponível Revisão de Código', estado: 'Active' },
  { nome: 'Realizando revisão de código', estado: 'Active' },
  { nome: 'Disponível para teste', estado: 'Active' },
  { nome: 'Testando', estado: 'Active' },
  { nome: 'Aguardando pipeline', estado: 'Active' },
  { nome: 'Pronto pra release', estado: 'Resolved' },
  { nome: 'Release candidate', estado: 'Resolved' },
  { nome: 'Concluído', estado: 'Closed' },
] as const;

/**
 * Columns that count in no metric. "Ideias" is on every board; "UX" exists only on Retaguarda WEB.
 * Override with AZDO_COLUNAS_IGNORADAS (comma separated).
 */
export const COLUNAS_IGNORADAS_PADRAO = ['Ideias', 'UX'];
export const COLUNA_LEAD_INICIO = 'Backlog';
export const COLUNA_CYCLE_INICIO = 'Fazendo Análise';
/** The cycle ends on the first arrival at "Pronto pra release" (or any later column, or state Resolved). */
export const COLUNA_CYCLE_FIM = 'Pronto pra release';
export const COLUNA_ENTREGA = 'Concluído';

/** Names are matched without regard to case, accents or extra spaces ("CONCLUIDO " = "Concluído"). */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const POSICAO = new Map<string, number>(COLUNAS.map((c, i) => [norm(c.nome), i]));
const IGNORADAS = new Set((process.env.AZDO_COLUNAS_IGNORADAS ?? COLUNAS_IGNORADAS_PADRAO.join(',')).split(',').map(norm).filter(Boolean));
const ESTADO_PARA_COLUNA: Record<string, string> = { New: 'Backlog', Active: 'Dev implementando', Resolved: 'Pronto pra release', Closed: 'Concluído', Done: 'Concluído' };

export const colunaIgnorada = (nome?: string) => !!nome && IGNORADAS.has(norm(nome));

/** Position of a column in the flow, or undefined for an ignored column or a name that is not on the board. */
export function posicaoColuna(nome?: string): number | undefined {
  return nome && !colunaIgnorada(nome) ? POSICAO.get(norm(nome)) : undefined;
}

/** Column names that this code does not know (typo, rename, or a team with another column). */
export const colunaDesconhecida = (nome?: string) => !!nome && !colunaIgnorada(nome) && !POSICAO.has(norm(nome));

/** The column of an item; falls back to the state when the board column is missing or unknown. */
export function colunaEfetiva(i: { coluna?: string; estado: string }): string {
  if (colunaIgnorada(i.coluna)) return i.coluna!.trim();
  const p = posicaoColuna(i.coluna);
  return p !== undefined ? COLUNAS[p].nome : (ESTADO_PARA_COLUNA[i.estado] ?? 'Backlog');
}

const POS_LEAD = posicaoColuna(COLUNA_LEAD_INICIO)!;
const POS_INICIO = posicaoColuna(COLUNA_CYCLE_INICIO)!;
const POS_FIM = posicaoColuna(COLUNA_CYCLE_FIM)!;

/** Out of every metric (Ideias, UX). */
export const ehIgnorada = (i: { coluna?: string }) => colunaIgnorada(i.coluna);

/** WIP: from "Fazendo Análise" up to "Aguardando pipeline", i.e. inside the cycle and before it ends. */
export function emCiclo(i: { coluna?: string; estado: string }): boolean {
  if (ehIgnorada(i)) return false;
  const p = posicaoColuna(colunaEfetiva(i))!;
  return p >= POS_INICIO && p < POS_FIM;
}

const noMinimo = (coluna: string | undefined, pos: number) => {
  const p = posicaoColuna(coluna);
  return p !== undefined && p >= pos;
};
/** In "Backlog" or any later column: the lead time starts. */
export const iniciouLead = (coluna?: string) => noMinimo(coluna, POS_LEAD);
/** In "Fazendo Análise" or any later column: the cycle time starts. */
export const iniciouCiclo = (coluna?: string) => noMinimo(coluna, POS_INICIO);
/** In "Pronto pra release" or any later column: the cycle time ends. */
export const terminouCiclo = (coluna?: string) => noMinimo(coluna, POS_FIM);

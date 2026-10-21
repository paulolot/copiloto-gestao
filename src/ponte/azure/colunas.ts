/**
 * Board columns of the three teams (given by Paulo on 21/10/2026), in flow order.
 * The state alone is not enough: "Fazendo Análise" is state New but is where the cycle time starts,
 * so the column decides what is in the cycle, what is WIP and what is out of every metric.
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

export const COLUNA_IGNORADA = 'Ideias';
export const COLUNA_INICIO_CICLO = 'Fazendo Análise';
export const COLUNA_FIM = 'Concluído';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const POSICAO = new Map<string, number>(COLUNAS.map((c, i) => [norm(c.nome), i]));
const ESTADO_PARA_COLUNA: Record<string, string> = { New: 'Backlog', Active: 'Dev implementando', Resolved: 'Pronto pra release', Closed: 'Concluído', Done: 'Concluído' };

/** Position of a column in the flow, or undefined for a name that is not on the board. */
export function posicaoColuna(nome?: string): number | undefined {
  return nome ? POSICAO.get(norm(nome)) : undefined;
}

/** The column of an item; falls back to the state when the board column is missing or unknown. */
export function colunaEfetiva(i: { coluna?: string; estado: string }): string {
  const p = posicaoColuna(i.coluna);
  return p !== undefined ? COLUNAS[p].nome : (ESTADO_PARA_COLUNA[i.estado] ?? 'Backlog');
}

const POS_INICIO = posicaoColuna(COLUNA_INICIO_CICLO)!;
const POS_FIM = posicaoColuna(COLUNA_FIM)!;

/** Out of every metric. */
export const ehIdeia = (i: { coluna?: string; estado: string }) => colunaEfetiva(i) === COLUNA_IGNORADA;

/** In the cycle: from "Fazendo Análise" up to "Release candidate" (this is the WIP). */
export function emCiclo(i: { coluna?: string; estado: string }): boolean {
  const p = posicaoColuna(colunaEfetiva(i))!;
  return p >= POS_INICIO && p < POS_FIM;
}

/** True if the column is "Fazendo Análise" or any later one (a revision where this holds starts the cycle). */
export const jaIniciouCiclo = (coluna?: string) => {
  const p = posicaoColuna(coluna);
  return p !== undefined && p >= POS_INICIO;
};

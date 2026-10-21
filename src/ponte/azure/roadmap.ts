/**
 * Roadmap progress by tag
 * The teams have no sprints; roadmaps are not on the board, they are agreed in conversation and, at most,
 * marked with a tag on the work items. Every tag that starts with AZDO_TAG_ROADMAP (default "roadmap",
 * case and accents ignored) is one roadmap. Items in Ideias and UX are out, like in every metric.
 */
import type { Database } from 'sql.js';
import { colunaEfetiva } from './colunas.js';
import { carregarItens, diasSemMudanca, ehBloqueado, ehPronto, limitesDoAmbiente, dataFechamento, type ItemBoard } from './metricas.js';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export const prefixoRoadmap = (env: NodeJS.ProcessEnv = process.env) => norm(env.AZDO_TAG_ROADMAP || 'roadmap');

export interface ItemResumo {
  id: number;
  titulo: string;
  coluna: string;
  diasSemMudanca: number;
}

export interface Roadmap {
  tag: string;
  total: number;
  entregues: number;               // Concluído
  aguardandoRelease: number;       // Pronto pra release / Release candidate
  emAndamento: number;             // Fazendo Análise até Aguardando pipeline
  naoIniciados: number;            // Backlog
  percentualEntregue: number;
  primeiroItemCriadoEm?: string;
  ultimaEntregaEm?: string;
  paralisados: ItemResumo[];
  parados: ItemResumo[];           // abertos sem alteração há mais que o limite de envelhecimento
}

export function roadmaps(db: Database, timeId: string, opts: { tag?: string; agora?: Date; prefixo?: string } = {}): Roadmap[] {
  const agora = opts.agora ?? new Date();
  const prefixo = opts.prefixo ?? prefixoRoadmap();
  const limite = limitesDoAmbiente().envelhecimentoDias;
  const alvo = opts.tag ? norm(opts.tag) : undefined;

  // One roadmap per tag, whatever the case or accents; the first spelling found is the label.
  const porTag = new Map<string, { tag: string; itens: ItemBoard[] }>();
  for (const i of carregarItens(db, timeId)) {
    if (i.estado === 'Removed') continue;
    for (const t of i.tags) {
      const n = norm(t);
      if (!n.startsWith(prefixo) || (alvo && n !== alvo)) continue;
      const g = porTag.get(n) ?? { tag: t.trim(), itens: [] };
      g.itens.push(i);
      porTag.set(n, g);
    }
  }

  const resumo = (i: ItemBoard): ItemResumo => ({ id: i.id, titulo: i.titulo, coluna: colunaEfetiva(i), diasSemMudanca: diasSemMudanca(i, agora) });
  return [...porTag.values()].sort((a, b) => a.tag.localeCompare(b.tag, 'pt-BR')).map(({ tag, itens }) => {
    const entregues = itens.filter(ehPronto);
    const abertos = itens.filter((i) => !ehPronto(i));
    const col = (i: ItemBoard) => colunaEfetiva(i);
    const datas = itens.map((i) => new Date(i.criadoEm ?? '').getTime()).filter(Number.isFinite);
    const entregas = entregues.map(dataFechamento).filter(Number.isFinite);
    return {
      tag,
      total: itens.length,
      entregues: entregues.length,
      aguardandoRelease: abertos.filter((i) => ['Pronto pra release', 'Release candidate'].includes(col(i))).length,
      emAndamento: abertos.filter((i) => !['Backlog', 'Pronto pra release', 'Release candidate'].includes(col(i))).length,
      naoIniciados: abertos.filter((i) => col(i) === 'Backlog').length,
      percentualEntregue: Math.round((entregues.length / itens.length) * 100),
      primeiroItemCriadoEm: datas.length ? new Date(Math.min(...datas)).toISOString() : undefined,
      ultimaEntregaEm: entregas.length ? new Date(Math.max(...entregas)).toISOString() : undefined,
      paralisados: abertos.filter(ehBloqueado).map(resumo),
      parados: abertos.filter((i) => diasSemMudanca(i, agora) > limite).map(resumo).sort((a, b) => b.diasSemMudanca - a.diasSemMudanca).slice(0, 10),
    };
  });
}

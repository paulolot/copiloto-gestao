/**
 * Delivery milestones ("marcos de entrega")
 * The teams have no sprints. A milestone is a date on which a set of work items is to be delivered,
 * and the set is marked by a tag that is picked at random when the milestone is agreed. So the milestone
 * is registered here (name, tag, date) and followed against the board.
 *
 * Risk is an estimate: open items against what the team(s) usually finish in the weeks left
 * (average of the last 8 weeks, all items, not only the marked ones).
 */
import type { Database } from 'sql.js';
import { persist } from '../db/database.js';
import { colunaEfetiva } from './colunas.js';
import { timesAtivos } from './escopo.js';
import {
  carregarItens, dataFechamento, diasSemMudanca, ehBloqueado, ehPronto, limitesDoAmbiente, type ItemBoard,
} from './metricas.js';
import type { Sinal } from './alertas.js';

const DIA = 86_400_000;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export type EstadoMarco = 'ativo' | 'entregue' | 'cancelado';

export interface Marco {
  id: number;
  nome: string;
  tag: string;
  timeId?: string;
  data: string;
  dataOriginal: string;
  adiamentos: number;
  estado: EstadoMarco;
}

const COLS = 'id, nome, tag, time_id, data, data_original, adiamentos, estado';
const linha = (v: unknown[]): Marco => ({
  id: v[0] as number, nome: v[1] as string, tag: v[2] as string, timeId: (v[3] as string) ?? undefined,
  data: v[4] as string, dataOriginal: v[5] as string, adiamentos: v[6] as number, estado: v[7] as EstadoMarco,
});

export function marcoRegistrar(db: Database, m: { nome: string; tag: string; data: string; timeId?: string }): number {
  if (!DATA.test(m.data)) throw new Error('Data deve estar no formato AAAA-MM-DD');
  if (!norm(m.tag)) throw new Error('Informe a tag que marca os work items do marco');
  const dup = db.exec("SELECT id FROM marcos WHERE estado = 'ativo' AND lower(tag) = lower(?)", [m.tag.trim()])[0]?.values[0]?.[0];
  if (dup) throw new Error(`A tag "${m.tag}" já está no marco #${dup}. Atualize aquele marco em vez de criar outro.`);
  db.run('INSERT INTO marcos (nome, tag, time_id, data, data_original) VALUES (?,?,?,?,?)', [m.nome, m.tag.trim(), m.timeId ?? null, m.data, m.data]);
  const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;
  persist(db);
  return id;
}

/** Changes the date (a later date counts as a postponement), the tag, or the state. */
export function marcoAtualizar(db: Database, id: number, mudanca: { data?: string; tag?: string; estado?: EstadoMarco }): Marco {
  const atual = marcoObter(db, id);
  if (!atual) throw new Error(`Marco #${id} não existe`);
  if (mudanca.data !== undefined && !DATA.test(mudanca.data)) throw new Error('Data deve estar no formato AAAA-MM-DD');
  const adiou = mudanca.data !== undefined && mudanca.data > atual.data;
  db.run(
    `UPDATE marcos SET data = ?, tag = ?, estado = ?, adiamentos = adiamentos + ?, atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    [mudanca.data ?? atual.data, mudanca.tag?.trim() || atual.tag, mudanca.estado ?? atual.estado, adiou ? 1 : 0, id],
  );
  persist(db);
  return marcoObter(db, id)!;
}

export function marcoObter(db: Database, id: number): Marco | undefined {
  const v = db.exec(`SELECT ${COLS} FROM marcos WHERE id = ?`, [id])[0]?.values[0];
  return v ? linha(v) : undefined;
}

export function marcoListar(db: Database, opts: { incluirEncerrados?: boolean } = {}): Marco[] {
  return (db.exec(`SELECT ${COLS} FROM marcos ${opts.incluirEncerrados ? '' : "WHERE estado = 'ativo'"} ORDER BY data, id`)[0]?.values ?? []).map(linha);
}

export type Risco = 'ok' | 'atencao' | 'alto' | 'atrasado' | 'indeterminado' | 'concluido';

export interface ItemResumo {
  id: number;
  titulo: string;
  coluna: string;
  diasSemMudanca: number;
}

export interface StatusMarco extends Marco {
  diasAteAData: number;               // negativo = data já passou
  totalItens: number;
  entregues: number;                  // Concluído
  aguardandoRelease: number;          // Pronto pra release / Release candidate
  emAndamento: number;
  naoIniciados: number;
  percentualEntregue: number;
  abertos: number;
  ritmoSemanal?: number;              // média de itens concluídos por semana nas últimas 8 semanas
  capacidadeEstimada?: number;        // ritmo × semanas até a data
  risco: Risco;
  paralisados: ItemResumo[];
  parados: ItemResumo[];
}

function timesDoMarco(m: Marco): string[] {
  return m.timeId ? [m.timeId] : timesAtivos().map((t) => t.id);
}

export function statusDoMarco(db: Database, m: Marco, agora = new Date()): StatusMarco {
  const hoje = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  const diasAteAData = Math.round((Date.parse(`${m.data}T00:00:00Z`) - hoje) / DIA);
  const limite = limitesDoAmbiente().envelhecimentoDias;
  const alvo = norm(m.tag);

  const todos: ItemBoard[] = timesDoMarco(m).flatMap((t) => carregarItens(db, t));
  const itens = todos.filter((i) => i.estado !== 'Removed' && i.tags.some((t) => norm(t) === alvo));
  const entregues = itens.filter(ehPronto);
  const abertos = itens.filter((i) => !ehPronto(i));
  const col = colunaEfetiva;
  const resumo = (i: ItemBoard): ItemResumo => ({ id: i.id, titulo: i.titulo, coluna: col(i), diasSemMudanca: diasSemMudanca(i, agora) });

  const concluidos8 = todos.filter((i) => ehPronto(i) && agora.getTime() - dataFechamento(i) <= 56 * DIA).length;
  const ritmo = todos.some(ehPronto) ? concluidos8 / 8 : undefined;
  const semanas = Math.max(diasAteAData, 0) / 7;
  const capacidadeBruta = ritmo === undefined ? undefined : ritmo * semanas;
  const ritmoSemanal = ritmo === undefined ? undefined : Math.round(ritmo * 10) / 10;
  const capacidade = capacidadeBruta === undefined ? undefined : Math.round(capacidadeBruta * 10) / 10;

  let risco: Risco;
  if (itens.length > 0 && abertos.length === 0) risco = 'concluido';
  else if (diasAteAData < 0) risco = 'atrasado';
  else if (capacidadeBruta === undefined || itens.length === 0) risco = 'indeterminado';
  else if (abertos.length <= capacidadeBruta * 0.7) risco = 'ok';
  else if (abertos.length <= capacidadeBruta) risco = 'atencao';
  else risco = 'alto';

  return {
    ...m, diasAteAData, totalItens: itens.length, entregues: entregues.length,
    aguardandoRelease: abertos.filter((i) => ['Pronto pra release', 'Release candidate'].includes(col(i))).length,
    emAndamento: abertos.filter((i) => !['Backlog', 'Pronto pra release', 'Release candidate'].includes(col(i))).length,
    naoIniciados: abertos.filter((i) => col(i) === 'Backlog').length,
    percentualEntregue: itens.length ? Math.round((entregues.length / itens.length) * 100) : 0,
    abertos: abertos.length, ritmoSemanal, capacidadeEstimada: capacidade, risco,
    paralisados: abertos.filter(ehBloqueado).map(resumo),
    parados: abertos.filter((i) => diasSemMudanca(i, agora) > limite).map(resumo).sort((a, b) => b.diasSemMudanca - a.diasSemMudanca).slice(0, 10),
  };
}

/** Tags in use on the board and how many items carry each, to help pick the tag of a milestone. */
export function tagsEmUso(db: Database, timeIds: string[]): { tag: string; itens: number; abertos: number }[] {
  const por = new Map<string, { tag: string; itens: number; abertos: number }>();
  for (const t of timeIds) {
    for (const i of carregarItens(db, t)) {
      for (const tag of i.tags) {
        const k = norm(tag);
        const e = por.get(k) ?? { tag: tag.trim(), itens: 0, abertos: 0 };
        e.itens++;
        if (!ehPronto(i)) e.abertos++;
        por.set(k, e);
      }
    }
  }
  return [...por.values()].filter((e) => e.abertos > 0).sort((a, b) => b.abertos - a.abertos || a.tag.localeCompare(b.tag, 'pt-BR'));
}

/** Signals for milestones at risk; they go through the same dated-signal table as the board alerts. */
export function sinaisDeMarcos(db: Database, agora = new Date()): Sinal[] {
  const dataBr = (d: string) => d.split('-').reverse().join('/');
  const out: Sinal[] = [];
  for (const m of marcoListar(db)) {
    const s = statusDoMarco(db, m, agora);
    const base = `Marco "${m.nome}" (entrega ${dataBr(m.data)}${m.adiamentos ? `, adiado ${m.adiamentos}x` : ''})`;
    if (s.risco === 'atrasado') {
      out.push({ chave: `marco:${m.id}`, severidade: 'vermelho', descricao: `${base}: a data passou e restam ${s.abertos} de ${s.totalItens} itens` });
    } else if (s.risco === 'alto') {
      out.push({ chave: `marco:${m.id}`, severidade: 'vermelho', descricao: `${base}: restam ${s.abertos} de ${s.totalItens} itens e o ritmo estima ${s.capacidadeEstimada} até a data` });
    } else if (s.risco === 'atencao') {
      out.push({ chave: `marco:${m.id}`, severidade: 'amarelo', descricao: `${base}: restam ${s.abertos} de ${s.totalItens} itens, no limite do ritmo (${s.capacidadeEstimada} estimados até a data)` });
    }
  }
  return out;
}

/**
 * Delivery milestones ("marcos de entrega")
 * The teams have no sprints. A milestone is a date on which a set of work items is to be delivered,
 * and the set is marked by a tag picked at random when it is agreed. So the milestone is registered
 * here and followed against the board.
 *
 * Paulo defines the rules of each milestone whenever he wants, per team, even before the tag and the
 * date exist (state "planejado" = the rules of the next milestone). The rules are:
 *   confianca       percentile the forecast must reach (50 to 99, default 85)
 *   janelaSemanas   weeks of history behind the forecast (4 to 52, default 12)
 *   tipos           work item types counted (default: User Story and Bug)
 *   escopoFechado   warn when items join the tag after the milestone was set
 *   observacao      free text with any other rule, shown next to the milestone
 *
 * The forecast is probabilistic (see previsao.ts), not an average.
 */
import type { Database } from 'sql.js';
import { persist } from '../db/database.js';
import { colunaEfetiva } from './colunas.js';
import { timesAtivos, tiposContados } from './escopo.js';
import {
  carregarItens, dataFechamento, diasSemMudanca, ehBloqueado, ehPronto, limitesDoAmbiente, type ItemBoard,
} from './metricas.js';
import { preverEntrega, type Previsao } from './previsao.js';
import type { Sinal } from './alertas.js';

const DIA = 86_400_000;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export type EstadoMarco = 'planejado' | 'ativo' | 'entregue' | 'cancelado';

export interface RegrasMarco {
  confianca: number;
  janelaSemanas: number;
  tipos?: string[];
  escopoFechado: boolean;
  observacao?: string;
}

export interface Marco {
  id: number;
  nome: string;
  tag?: string;
  timeId?: string;
  data?: string;
  dataOriginal?: string;
  adiamentos: number;
  estado: EstadoMarco;
  escopoInicial?: number;
  regras: RegrasMarco;
}

export const REGRAS_PADRAO = { confianca: 85, janelaSemanas: 12 };

const COLS = 'id, nome, tag, time_id, data, data_original, adiamentos, estado, confianca, janela_semanas, tipos, escopo_fechado, escopo_inicial, observacao';
const linha = (v: unknown[]): Marco => ({
  id: v[0] as number, nome: v[1] as string, tag: (v[2] as string) ?? undefined, timeId: (v[3] as string) ?? undefined,
  data: (v[4] as string) ?? undefined, dataOriginal: (v[5] as string) ?? undefined, adiamentos: v[6] as number, estado: v[7] as EstadoMarco,
  escopoInicial: (v[12] as number) ?? undefined,
  regras: {
    confianca: v[8] as number, janelaSemanas: v[9] as number, tipos: v[10] ? (v[10] as string).split('|') : undefined,
    escopoFechado: v[11] === 1, observacao: (v[13] as string) ?? undefined,
  },
});

export interface EntradaMarco {
  id?: number;
  nome?: string;
  tag?: string;
  data?: string;
  timeId?: string;
  confianca?: number;
  janelaSemanas?: number;
  tipos?: string[];
  escopoFechado?: boolean;
  observacao?: string;
  estado?: 'entregue' | 'cancelado' | 'ativo';
}

export function marcoObter(db: Database, id: number): Marco | undefined {
  const v = db.exec(`SELECT ${COLS} FROM marcos WHERE id = ?`, [id])[0]?.values[0];
  return v ? linha(v) : undefined;
}

export function marcoListar(db: Database, opts: { incluirEncerrados?: boolean } = {}): Marco[] {
  const filtro = opts.incluirEncerrados ? '' : "WHERE estado IN ('planejado','ativo')";
  return (db.exec(`SELECT ${COLS} FROM marcos ${filtro} ORDER BY CASE estado WHEN 'ativo' THEN 0 WHEN 'planejado' THEN 1 ELSE 2 END, data, id`)[0]?.values ?? []).map(linha);
}

function validar(e: EntradaMarco): void {
  if (e.data !== undefined && !DATA.test(e.data)) throw new Error('Data deve estar no formato AAAA-MM-DD');
  if (e.confianca !== undefined && !(Number.isInteger(e.confianca) && e.confianca >= 50 && e.confianca <= 99)) {
    throw new Error('Confiança deve ser um número inteiro de 50 a 99 (por exemplo 85 para P85)');
  }
  if (e.janelaSemanas !== undefined && !(Number.isInteger(e.janelaSemanas) && e.janelaSemanas >= 4 && e.janelaSemanas <= 52)) {
    throw new Error('Janela de histórico deve ser de 4 a 52 semanas');
  }
  if (e.tipos) {
    const validos = tiposContados().map((t) => t.toLowerCase());
    const fora = e.tipos.filter((t) => !validos.includes(t.trim().toLowerCase()));
    if (fora.length) throw new Error(`Tipo(s) fora dos que entram nas métricas (${tiposContados().join(', ')}): ${fora.join(', ')}`);
  }
}

/**
 * Creates or changes a milestone. Without `id`, a call with a tag already used by an active milestone
 * changes that milestone, else it completes the "planejado" one of the same team (the next milestone),
 * else it creates one. With tag and date it becomes "ativo"; with only rules it stays "planejado".
 * A later date on an active milestone counts as a postponement.
 */
export function marcoDefinir(db: Database, e: EntradaMarco): { marco: Marco; criado: boolean } {
  validar(e);
  let atual: Marco | undefined;
  if (e.id !== undefined) {
    atual = marcoObter(db, e.id);
    if (!atual) throw new Error(`Marco #${e.id} não existe`);
  } else {
    const ativos = marcoListar(db);
    atual = (e.tag && ativos.find((m) => m.tag && norm(m.tag) === norm(e.tag!)))
      || ativos.find((m) => m.estado === 'planejado' && (m.timeId ?? null) === (e.timeId ?? null));
  }

  const tag = e.tag?.trim() || atual?.tag;
  const data = e.data ?? atual?.data;
  const r = atual?.regras;
  const regras: RegrasMarco = {
    confianca: e.confianca ?? r?.confianca ?? REGRAS_PADRAO.confianca,
    janelaSemanas: e.janelaSemanas ?? r?.janelaSemanas ?? REGRAS_PADRAO.janelaSemanas,
    tipos: e.tipos?.map((t) => t.trim()) ?? r?.tipos,
    escopoFechado: e.escopoFechado ?? r?.escopoFechado ?? false,
    observacao: e.observacao ?? r?.observacao,
  };
  let estado: EstadoMarco = e.estado === 'entregue' || e.estado === 'cancelado' ? e.estado : tag && data ? 'ativo' : 'planejado';
  if (atual && (atual.estado === 'entregue' || atual.estado === 'cancelado') && e.estado === undefined) estado = atual.estado;

  const duplicada = tag && marcoListar(db).find((m) => m.id !== atual?.id && m.tag && norm(m.tag) === norm(tag));
  if (duplicada) throw new Error(`A tag "${tag}" já está no marco #${duplicada.id}`);

  const adiou = !!atual && atual.estado === 'ativo' && !!atual.data && !!data && data > atual.data;
  const tipos = regras.tipos?.join('|') ?? null;

  if (atual) {
    db.run(
      `UPDATE marcos SET nome = ?, tag = ?, time_id = ?, data = ?, data_original = ?, adiamentos = adiamentos + ?, estado = ?,
         confianca = ?, janela_semanas = ?, tipos = ?, escopo_fechado = ?, observacao = ?, atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      [e.nome ?? atual.nome, tag ?? null, e.timeId ?? atual.timeId ?? null, data ?? null, atual.dataOriginal ?? data ?? null, adiou ? 1 : 0, estado,
        regras.confianca, regras.janelaSemanas, tipos, regras.escopoFechado ? 1 : 0, regras.observacao ?? null, atual.id],
    );
  } else {
    db.run(
      `INSERT INTO marcos (nome, tag, time_id, data, data_original, estado, confianca, janela_semanas, tipos, escopo_fechado, observacao)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [e.nome ?? 'Próximo marco', tag ?? null, e.timeId ?? null, data ?? null, data ?? null, estado, regras.confianca, regras.janelaSemanas, tipos,
        regras.escopoFechado ? 1 : 0, regras.observacao ?? null],
    );
  }
  const id = atual?.id ?? (db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number);

  // The scope at the moment the milestone becomes active is the baseline of "escopo fechado".
  const marco = marcoObter(db, id)!;
  if (marco.estado === 'ativo' && marco.escopoInicial === undefined) {
    db.run('UPDATE marcos SET escopo_inicial = ? WHERE id = ?', [itensDoMarco(db, marco).itens.length, id]);
  }
  persist(db);
  return { marco: marcoObter(db, id)!, criado: !atual };
}

function timesDoMarco(m: Marco): string[] {
  return m.timeId ? [m.timeId] : timesAtivos().map((t) => t.id);
}

const tiposDoMarco = (m: Marco) => (m.regras.tipos ?? tiposContados()).map((t) => t.toLowerCase());

function itensDoMarco(db: Database, m: Marco): { todos: ItemBoard[]; itens: ItemBoard[] } {
  const tipos = tiposDoMarco(m);
  const todos = timesDoMarco(m).flatMap((t) => carregarItens(db, t)).filter((i) => tipos.includes(i.tipo.toLowerCase()));
  const alvo = m.tag ? norm(m.tag) : undefined;
  return { todos, itens: alvo ? todos.filter((i) => i.estado !== 'Removed' && i.tags.some((t) => norm(t) === alvo)) : [] };
}

export type Risco = 'ok' | 'atencao' | 'alto' | 'atrasado' | 'indeterminado' | 'concluido';

export interface ItemResumo {
  id: number;
  titulo: string;
  coluna: string;
  diasSemMudanca: number;
}

export interface StatusMarco extends Marco {
  diasAteAData?: number;              // negativo = data já passou
  totalItens: number;
  entregues: number;                  // Concluído
  aguardandoRelease: number;
  emAndamento: number;
  naoIniciados: number;
  percentualEntregue: number;
  abertos: number;
  itensAdicionadosDepoisDoRegistro?: number;   // só com escopo fechado
  previsao?: Previsao;
  risco?: Risco;
  paralisados: ItemResumo[];
  parados: ItemResumo[];
}

/** Items finished per week in the last `semanas` weeks, oldest first (rolling 7-day buckets ending now). */
export function vazaoSemanal(itens: ItemBoard[], semanas: number, agora: Date): number[] {
  const out = Array.from({ length: semanas }, () => 0);
  for (const i of itens) {
    if (!ehPronto(i)) continue;
    const idade = (agora.getTime() - dataFechamento(i)) / (7 * DIA);
    if (idade >= 0 && idade < semanas) out[semanas - 1 - Math.floor(idade)]++;
  }
  return out;
}

const semente = (m: Marco, abertos: number, agora: Date) =>
  [...`${m.id}|${m.tag}|${m.data}|${abertos}|${agora.toISOString().slice(0, 10)}`].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

export function statusDoMarco(db: Database, m: Marco, agora = new Date()): StatusMarco {
  const vazio = { totalItens: 0, entregues: 0, aguardandoRelease: 0, emAndamento: 0, naoIniciados: 0, percentualEntregue: 0, abertos: 0, paralisados: [], parados: [] };
  if (m.estado === 'planejado' || !m.tag || !m.data) return { ...m, ...vazio };

  const hoje = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  const diasAteAData = Math.round((Date.parse(`${m.data}T00:00:00Z`) - hoje) / DIA);
  const limite = limitesDoAmbiente().envelhecimentoDias;
  const { todos, itens } = itensDoMarco(db, m);
  const entregues = itens.filter(ehPronto);
  const abertos = itens.filter((i) => !ehPronto(i));
  const col = colunaEfetiva;
  const resumo = (i: ItemBoard): ItemResumo => ({ id: i.id, titulo: i.titulo, coluna: col(i), diasSemMudanca: diasSemMudanca(i, agora) });

  const previsao = preverEntrega({
    vazao: vazaoSemanal(todos, m.regras.janelaSemanas, agora),
    itens: abertos.length,
    semanasAteData: Math.max(diasAteAData, 0) / 7,
    agora,
    seed: semente(m, abertos.length, agora),
    confianca: m.regras.confianca,
  });

  // Risk against the confidence the rules ask for: the date must be reachable with at least `confianca`% chance.
  let risco: Risco;
  const p = previsao.probabilidadeAteAData;
  if (itens.length > 0 && abertos.length === 0) risco = 'concluido';
  else if (diasAteAData < 0) risco = 'atrasado';
  else if (itens.length === 0 || p === undefined) risco = 'indeterminado';
  else if (p >= m.regras.confianca / 100) risco = 'ok';
  else if (p >= 0.5) risco = 'atencao';
  else risco = 'alto';

  return {
    ...m, diasAteAData, totalItens: itens.length, entregues: entregues.length,
    aguardandoRelease: abertos.filter((i) => ['Pronto pra release', 'Release candidate'].includes(col(i))).length,
    emAndamento: abertos.filter((i) => !['Backlog', 'Pronto pra release', 'Release candidate'].includes(col(i))).length,
    naoIniciados: abertos.filter((i) => col(i) === 'Backlog').length,
    percentualEntregue: itens.length ? Math.round((entregues.length / itens.length) * 100) : 0,
    abertos: abertos.length,
    ...(m.regras.escopoFechado && m.escopoInicial !== undefined ? { itensAdicionadosDepoisDoRegistro: Math.max(0, itens.length - m.escopoInicial) } : {}),
    previsao, risco,
    paralisados: abertos.filter(ehBloqueado).map(resumo),
    parados: abertos.filter((i) => diasSemMudanca(i, agora) > limite).map(resumo).sort((a, b) => b.diasSemMudanca - a.diasSemMudanca).slice(0, 10),
  };
}

/** Tags in use on open items and how many items carry each, to help pick the tag of a milestone. */
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

/** Signals for milestones at risk; they use the same dated-signal table as the board alerts. */
export function sinaisDeMarcos(db: Database, agora = new Date()): Sinal[] {
  const dataBr = (d: string) => d.split('-').reverse().join('/');
  const pct = (x?: number) => (x === undefined ? '?' : `${Math.round(x * 100)}%`);
  const out: Sinal[] = [];
  for (const m of marcoListar(db)) {
    if (m.estado !== 'ativo') continue;
    const s = statusDoMarco(db, m, agora);
    const base = `Marco "${m.nome}" (entrega ${dataBr(m.data!)}${m.adiamentos ? `, adiado ${m.adiamentos}x` : ''})`;
    const faltam = `restam ${s.abertos} de ${s.totalItens} itens`;
    const alvo = `P${m.regras.confianca}`;
    if (s.risco === 'atrasado') {
      out.push({ chave: `marco:${m.id}`, severidade: 'vermelho', descricao: `${base}: a data passou e ${faltam}` });
    } else if (s.risco === 'alto' || s.risco === 'atencao') {
      const quando = s.previsao?.dataNaConfianca ? `; ${alvo} estima ${dataBr(s.previsao.dataNaConfianca)}` : '; no ritmo atual não fecha em 3 anos';
      out.push({
        chave: `marco:${m.id}`, severidade: s.risco === 'alto' ? 'vermelho' : 'amarelo',
        descricao: `${base}: ${faltam}, chance de entregar até a data ${pct(s.previsao?.probabilidadeAteAData)} (a regra exige ${m.regras.confianca}%)${quando}`,
      });
    }
    if (s.itensAdicionadosDepoisDoRegistro) {
      out.push({ chave: `marco-escopo:${m.id}`, severidade: 'amarelo', descricao: `${base}: escopo fechado, mas ${s.itensAdicionadosDepoisDoRegistro} item(ns) entraram depois do registro` });
    }
  }
  return out;
}

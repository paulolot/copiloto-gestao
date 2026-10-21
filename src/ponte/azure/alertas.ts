/**
 * T1.4 — Alerts and problem items (RF-04, RF-05)
 * Fixed limits where the plan has them (plano.md → Métricas iniciais); otherwise deviation against
 * the baseline of the last 8 weeks / previous sprints. A signal remembers the date it first appeared,
 * so a yellow signal can go to the CTO agenda before it turns red.
 */
import type { Database } from 'sql.js';
import { persist } from '../db/database.js';
import { emCiclo } from './colunas.js';
import {
  calcularMetricas, carregarItens, diasSemMudanca, diasUteisEntre, ehBloqueado, ehPronto, limitesDoAmbiente, media,
  type ItemBoard, type Limites, type MetricasTime,
} from './metricas.js';

const DIA = 86_400_000;
export type Severidade = 'amarelo' | 'vermelho';

export interface Sinal {
  chave: string;
  descricao: string;
  severidade: Severidade;
}
export interface SinalRegistrado extends Sinal {
  time: string;
  desde: string;
}

export interface LimitesAlerta {
  bugRatePercent: number;
  compromissoPercent: number;
  escopoAdicionadoPercent: number;
  quedaForte: number;   // fraction of the baseline below which a drop is "strong"
  altaForte: number;    // multiple of the baseline above which a rise is "high"
  commitParadoDiasUteis: number;
}
export const LIMITES_ALERTA_PADRAO: LimitesAlerta = {
  bugRatePercent: 10, compromissoPercent: 80, escopoAdicionadoPercent: 20, quedaForte: 0.5, altaForte: 1.25, commitParadoDiasUteis: 3,
};

export function limitesAlertaDoAmbiente(env: NodeJS.ProcessEnv = process.env): LimitesAlerta {
  const n = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    ...LIMITES_ALERTA_PADRAO,
    bugRatePercent: n(env.LIMITE_BUG_RATE_PERCENT, LIMITES_ALERTA_PADRAO.bugRatePercent),
    compromissoPercent: n(env.LIMITE_COMPROMISSO_PERCENT, LIMITES_ALERTA_PADRAO.compromissoPercent),
    escopoAdicionadoPercent: n(env.LIMITE_ESCOPO_PERCENT, LIMITES_ALERTA_PADRAO.escopoAdicionadoPercent),
    commitParadoDiasUteis: n(env.LIMITE_COMMIT_PARADO_DIAS_UTEIS, LIMITES_ALERTA_PADRAO.commitParadoDiasUteis),
  };
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

export function avaliarSinais(m: MetricasTime, agora: Date, lim: Limites, la: LimitesAlerta = LIMITES_ALERTA_PADRAO): Sinal[] {
  const out: Sinal[] = [];
  const add = (chave: string, severidade: Severidade, descricao: string) => out.push({ chave, severidade, descricao });

  if (m.envelhecendo > 0) add('envelhecimento', 'amarelo', `${plural(m.envelhecendo, 'item', 'itens')} sem mudança de estado há mais de ${lim.envelhecimentoDias} dias`);
  if (m.bloqueadosAcimaDoLimite > 0) add('bloqueio', 'vermelho', `${plural(m.bloqueadosAcimaDoLimite, 'item bloqueado', 'itens bloqueados')} há mais de ${lim.bloqueioDiasUteis} dias úteis`);
  if (m.wipPorPessoa.pessoasAcimaDoLimite > 0) add('wip_pessoa', 'amarelo', `${plural(m.wipPorPessoa.pessoasAcimaDoLimite, 'pessoa', 'pessoas')} com WIP acima de ${lim.wipPorPessoa} (máximo ${m.wipPorPessoa.maximo})`);
  if (m.bugs.externosAbertos > 0 && m.bugs.semDono > 0) {
    // Bug Externo without owner is the serious case; plain bugs without owner are a yellow
    add('bug_sem_dono', 'vermelho', `${plural(m.bugs.semDono, 'bug aberto', 'bugs abertos')} sem dono (inclui bug de produção)`);
  } else if (m.bugs.semDono > 0) {
    add('bug_sem_dono', 'amarelo', `${plural(m.bugs.semDono, 'bug aberto', 'bugs abertos')} sem dono`);
  }

  // Weekly series: judge the last complete week against the mean of the weeks before it.
  const queda = (serie: number[], chave: string, nome: string) => {
    const base = media(serie.slice(0, 6));
    const ultima = serie[6];
    if (base !== undefined && base >= 2 && ultima < base * la.quedaForte) {
      add(chave, 'amarelo', `${nome} da última semana (${ultima}) bem abaixo da média das semanas anteriores (${base})`);
    }
  };
  queda(m.throughputSemanal.map((s) => s.entregues), 'throughput', 'Throughput');
  queda(m.commitsSemanais.map((s) => s.commits), 'commits_semana', 'Commits');

  for (const r of m.commitsPorRepo) {
    if (r.commits28Dias > 0 && r.ultimoCommit && diasUteisEntre(new Date(r.ultimoCommit), agora) > la.commitParadoDiasUteis) {
      add(`commit_parado:${r.repo}`, 'amarelo', `Repositório ${r.repo} sem commit desde ${r.ultimoCommit} (era ativo)`);
    }
  }

  // Sprint series: closed sprints, oldest first
  const fechadas = m.sprints.filter((s) => s.encerrada);
  const ult2 = fechadas.slice(-2);
  const anteriores = fechadas.slice(0, -2);
  const duasAltas = (get: (s: (typeof fechadas)[number]) => number | undefined, fator: number) => {
    const base = media(anteriores.map(get).filter((v): v is number => v !== undefined));
    const v = ult2.map(get);
    return base !== undefined && v.length === 2 && v.every((x) => x !== undefined && x > base * fator);
  };
  if (duasAltas((s) => s.cycleTimeDias, la.altaForte)) add('cycle_time', 'amarelo', 'Cycle time em alta nas últimas 2 sprints contra as anteriores');
  if (ult2.length === 2 && ult2.every((s) => s.compromisso !== undefined && s.compromisso < la.compromissoPercent)) {
    add('compromisso', 'amarelo', `Compromisso da sprint abaixo de ${la.compromissoPercent}% nas últimas 2 sprints (${ult2.map((s) => s.compromisso + '%').join(' e ')})`);
  }
  const ultima = fechadas.at(-1);
  if (ultima?.bugRate !== undefined && ultima.bugRate > la.bugRatePercent) {
    add('bug_rate', 'amarelo', `Bug rate de ${ultima.bugRate}% na ${ultima.sprint} (limite ${la.bugRatePercent}%)`);
  } else if (ult2.length === 2 && ult2[0].bugRate !== undefined && ult2[1].bugRate !== undefined && ult2[1].bugRate > ult2[0].bugRate && ult2[0].bugRate > (fechadas.at(-3)?.bugRate ?? Infinity)) {
    add('bug_rate', 'amarelo', 'Bug rate em alta por 2 sprints');
  }
  if (ultima?.mttrDias !== undefined) {
    const base = media(fechadas.slice(0, -1).map((s) => s.mttrDias).filter((v): v is number => v !== undefined));
    if (base !== undefined && ultima.mttrDias > base * 1.5) add('mttr', 'amarelo', `MTTR de ${ultima.mttrDias} dias na ${ultima.sprint}, acima da linha de base (${base} dias)`);
  }
  const atual = m.sprints.find((s) => !s.encerrada);
  if (atual && atual.itens > 0 && (atual.escopoAdicionado / atual.itens) * 100 > la.escopoAdicionadoPercent) {
    add('escopo', 'amarelo', `${atual.escopoAdicionado} de ${atual.itens} itens da ${atual.sprint} entraram depois do início (limite ${la.escopoAdicionadoPercent}%)`);
  }
  return out;
}

export interface AtualizacaoSinais {
  ativos: SinalRegistrado[];
  novos: SinalRegistrado[];
  resolvidos: string[];
}

/** Stores the signals, keeping the first-seen date while a signal stays active. */
export function atualizarSinais(db: Database, time: string, sinais: Sinal[], agora: Date): AtualizacaoSinais {
  const t = agora.toISOString();
  const existentes = new Map<string, { desde: string; ativo: number }>();
  for (const v of db.exec('SELECT chave, desde, ativo FROM sinais WHERE time_id = ?', [time])[0]?.values ?? []) {
    existentes.set(v[0] as string, { desde: v[1] as string, ativo: v[2] as number });
  }
  const novos: SinalRegistrado[] = [];
  const ativos: SinalRegistrado[] = [];
  for (const s of sinais) {
    const ex = existentes.get(s.chave);
    if (ex?.ativo) {
      db.run('UPDATE sinais SET descricao = ?, severidade = ?, ultimo_visto = ? WHERE time_id = ? AND chave = ?', [s.descricao, s.severidade, t, time, s.chave]);
      ativos.push({ ...s, time, desde: ex.desde });
    } else {
      db.run(
        `INSERT OR REPLACE INTO sinais (time_id, chave, descricao, severidade, desde, ultimo_visto, ativo, avisado) VALUES (?,?,?,?,?,?,1,0)`,
        [time, s.chave, s.descricao, s.severidade, t, t],
      );
      const reg = { ...s, time, desde: t };
      novos.push(reg);
      ativos.push(reg);
    }
  }
  const atuais = new Set(sinais.map((s) => s.chave));
  const resolvidos = [...existentes].filter(([k, v]) => v.ativo && !atuais.has(k)).map(([k]) => k);
  for (const k of resolvidos) db.run('UPDATE sinais SET ativo = 0 WHERE time_id = ? AND chave = ?', [time, k]);
  persist(db);
  return { ativos, novos, resolvidos };
}

/** Active signals with the date each one appeared. */
export function sinaisAtivos(db: Database, time?: string): SinalRegistrado[] {
  const r = db.exec(
    `SELECT time_id, chave, descricao, severidade, desde FROM sinais WHERE ativo = 1 ${time ? 'AND time_id = ?' : ''} ORDER BY severidade DESC, desde`,
    time ? [time] : [],
  );
  return (r[0]?.values ?? []).map((v) => ({ time: v[0] as string, chave: v[1] as string, descricao: v[2] as string, severidade: v[3] as Severidade, desde: v[4] as string }));
}

export function sinaisNaoAvisados(db: Database): SinalRegistrado[] {
  const r = db.exec(`SELECT time_id, chave, descricao, severidade, desde FROM sinais WHERE ativo = 1 AND avisado = 0 ORDER BY desde`);
  return (r[0]?.values ?? []).map((v) => ({ time: v[0] as string, chave: v[1] as string, descricao: v[2] as string, severidade: v[3] as Severidade, desde: v[4] as string }));
}

export function marcarAvisado(db: Database, time: string, chave: string): void {
  db.run('UPDATE sinais SET avisado = 1 WHERE time_id = ? AND chave = ?', [time, chave]);
  persist(db);
}

/** Computes metrics and signals, and stores the signals. */
export function avaliarTime(db: Database, time: string, agora = new Date()): { metricas: MetricasTime; sinais: AtualizacaoSinais } {
  const lim = limitesDoAmbiente();
  const metricas = calcularMetricas(db, time, agora, lim);
  return { metricas, sinais: atualizarSinais(db, time, avaliarSinais(metricas, agora, lim, limitesAlertaDoAmbiente()), agora) };
}

export type TipoProblema = 'parados' | 'bloqueados' | 'sem_dono' | 'sem_estimativa';
export const TIPOS_PROBLEMA: TipoProblema[] = ['parados', 'bloqueados', 'sem_dono', 'sem_estimativa'];

export interface ItemProblema {
  id: number;
  tipo: string;
  estado: string;
  titulo: string;
  diasNoEstado: number;
}

/** Work items by problem kind (RF-05). Never includes who the item belongs to. */
export function itensProblema(db: Database, time: string, tipo: TipoProblema, agora = new Date(), lim = limitesDoAmbiente()): ItemProblema[] {
  const dias = (i: ItemBoard) => diasSemMudanca(i, agora);
  const abertos = carregarItens(db, time).filter((i) => !ehPronto(i) && i.estado !== 'Removed');
  const iniciado = emCiclo;
  const filtro: Record<TipoProblema, (i: ItemBoard) => boolean> = {
    parados: (i) => dias(i) > lim.envelhecimentoDias,
    bloqueados: ehBloqueado,
    sem_dono: (i) => iniciado(i) && !i.temDono,
    sem_estimativa: (i) => iniciado(i) && i.pontos === undefined && !['Task', 'Bug', 'Bug Externo'].includes(i.tipo),
  };
  return abertos.filter(filtro[tipo]).sort((a, b) => dias(b) - dias(a))
    .map((i) => ({ id: i.id, tipo: i.tipo, estado: i.estado, titulo: i.titulo, diasNoEstado: dias(i) }));
}

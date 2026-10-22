/**
 * T1.4 — Alerts and problem items (RF-04, RF-05)
 * Fixed limits where the plan has them (plano.md → Métricas iniciais); otherwise deviation against
 * the baseline of the last 8 weeks / previous months. A signal remembers the date it first appeared,
 * so a yellow signal can go to the CTO agenda before it turns red.
 */
import type { Database } from 'sql.js';
import { persist } from '../db/database.js';
import { emCiclo } from './colunas.js';
import {
  calcularMetricas, carregarItens, diasSemMudanca, diasUteisEntre, ehBloqueado, ehBug, ehBugExterno, ehPronto, limitesDoAmbiente, media,
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
  quedaForte: number;   // fraction of the baseline below which a drop is "strong"
  altaForte: number;    // multiple of the baseline above which a rise is "high"
  commitParadoDiasUteis: number;
  /** Fewest User Stories resolved in a bug rate window (and in the one before it) for the window to raise an alert. */
  bugRateAmostraMinima: number;
}
export const LIMITES_ALERTA_PADRAO: LimitesAlerta = {
  bugRatePercent: 10, quedaForte: 0.5, altaForte: 1.25, commitParadoDiasUteis: 3, bugRateAmostraMinima: 10,
};

export function limitesAlertaDoAmbiente(env: NodeJS.ProcessEnv = process.env): LimitesAlerta {
  const n = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    ...LIMITES_ALERTA_PADRAO,
    bugRatePercent: n(env.LIMITE_BUG_RATE_PERCENT, LIMITES_ALERTA_PADRAO.bugRatePercent),
    commitParadoDiasUteis: n(env.LIMITE_COMMIT_PARADO_DIAS_UTEIS, LIMITES_ALERTA_PADRAO.commitParadoDiasUteis),
    bugRateAmostraMinima: n(env.LIMITE_BUG_RATE_AMOSTRA_MINIMA, LIMITES_ALERTA_PADRAO.bugRateAmostraMinima),
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

  // Monthly series (no sprints): closed months, oldest first
  const fechadas = m.meses.filter((x) => x.encerrado);
  const ult2 = fechadas.slice(-2);
  const anteriores = fechadas.slice(0, -2);
  const duasAltas = (get: (x: (typeof fechadas)[number]) => number | undefined, fator: number) => {
    const base = media(anteriores.map(get).filter((v): v is number => v !== undefined));
    const v = ult2.map(get);
    return base !== undefined && v.length === 2 && v.every((x) => x !== undefined && x > base * fator);
  };
  if (duasAltas((x) => x.cycleTimeDias, la.altaForte)) add('cycle_time', 'amarelo', 'Cycle time em alta nos últimos 2 meses contra os anteriores');
  const ultima = fechadas.at(-1);
  // Bug rate: only the 7 and 30-day windows alert, and only when the rate is rising against the window before it
  // and above the limit. Windows with few User Stories say little, so they stay quiet.
  const subindo = [30, 7].flatMap((dias) => {
    const j = m.bugRateJanelas.find((x) => x.dias === dias);
    const { atual, anterior } = j ?? {};
    if (!atual || !anterior || atual.taxa === undefined || anterior.taxa === undefined) return [];
    if (atual.userStoriesResolvidas < la.bugRateAmostraMinima || anterior.userStoriesResolvidas < la.bugRateAmostraMinima) return [];
    return atual.taxa > anterior.taxa && atual.taxa > la.bugRatePercent ? [`${dias} dias em ${atual.taxa}% (era ${anterior.taxa}%)`] : [];
  });
  if (subindo.length) add('bug_rate_janela', 'amarelo', `Bug rate subindo: ${subindo.join(' e ')} (limite ${la.bugRatePercent}%)`);
  if (ultima?.mttrDias !== undefined) {
    const base = media(fechadas.slice(0, -1).map((x) => x.mttrDias).filter((v): v is number => v !== undefined));
    if (base !== undefined && ultima.mttrDias > base * 1.5) add('mttr', 'amarelo', `MTTR de ${ultima.mttrDias} dias em ${ultima.mes}, acima da linha de base (${base} dias)`);
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
  // A signal that had been announced and stops holding gets one "resolved" notice (resolvido_em marks it as pending).
  for (const k of resolvidos) db.run('UPDATE sinais SET ativo = 0, resolvido_em = CASE WHEN avisado = 1 THEN ? ELSE NULL END, resolucao_avisada = 0 WHERE time_id = ? AND chave = ?', [t, time, k]);
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

export interface SinalResolvido extends SinalRegistrado {
  resolvidoEm: string;
}

/** Signals that were announced, stopped holding, and whose "resolved" notice has not gone out yet. */
export function sinaisResolvidosNaoAvisados(db: Database): SinalResolvido[] {
  const r = db.exec(`SELECT time_id, chave, descricao, severidade, desde, resolvido_em FROM sinais
                     WHERE ativo = 0 AND avisado = 1 AND resolvido_em IS NOT NULL AND resolucao_avisada = 0 ORDER BY resolvido_em`);
  return (r[0]?.values ?? []).map((v) => ({ time: v[0] as string, chave: v[1] as string, descricao: v[2] as string, severidade: v[3] as Severidade, desde: v[4] as string, resolvidoEm: v[5] as string }));
}

export function marcarResolucaoAvisada(db: Database, time: string, chave: string): void {
  db.run('UPDATE sinais SET resolucao_avisada = 1 WHERE time_id = ? AND chave = ?', [time, chave]);
  persist(db);
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
  /** Display name of the owner, when the card has one. */
  responsavel?: string;
}

export interface ItemAviso {
  id: number;
  tipo: string;
  titulo: string;
  dias?: number;
  /** Display name of the owner; filled only when `comResponsavel` is on. */
  responsavel?: string;
}

/** Items behind a signal, for the #alertas message. Owner names come out only when `comResponsavel` is on. */
export function itensDoSinal(db: Database, time: string, chave: string, agora: Date, comResponsavel: boolean, lim = limitesDoAmbiente()): { itens: ItemAviso[]; resumo?: string } {
  const todos = carregarItens(db, time);
  const abertos = todos.filter((i) => !ehPronto(i) && i.estado !== 'Removed');
  const dias = (i: ItemBoard) => diasSemMudanca(i, agora);
  const aviso = (i: ItemBoard): ItemAviso => ({ id: i.id, tipo: i.tipo, titulo: i.titulo, dias: dias(i), ...(comResponsavel && i.donoNome ? { responsavel: i.donoNome } : {}) });
  const ordenar = (l: ItemBoard[]) => l.sort((x, y) => dias(y) - dias(x)).map(aviso);
  if (chave === 'envelhecimento') return { itens: ordenar(abertos.filter((i) => dias(i) > lim.envelhecimentoDias)) };
  if (chave === 'bloqueio') {
    return { itens: ordenar(abertos.filter((i) => ehBloqueado(i) && diasUteisEntre(new Date(i.alteradoEm ?? agora), agora) > lim.bloqueioDiasUteis)) };
  }
  if (chave === 'bug_rate_janela') {
    const idade = (i: ItemBoard) => Math.floor((agora.getTime() - new Date(i.criadoEm ?? agora).getTime()) / 86_400_000);
    const bugs = (dias: number) => todos.filter((i) => i.estado !== 'Removed' && (ehBug(i) || ehBugExterno(i)) && idade(i) <= dias)
      .sort((x, y) => idade(x) - idade(y));
    const lista = bugs(7).length ? bugs(7) : bugs(30);
    return { itens: lista.map((i) => ({ ...aviso(i), dias: idade(i) })) };
  }
  if (chave === 'bug_sem_dono') return { itens: ordenar(abertos.filter((i) => (ehBug(i) || ehBugExterno(i)) && !i.temDono)) };
  if (chave === 'wip_pessoa' && comResponsavel) {
    const por = new Map<string, ItemBoard[]>();
    for (const i of abertos.filter(emCiclo)) {
      const nome = i.donoNome ?? i.dono;
      if (nome) por.set(nome, [...(por.get(nome) ?? []), i]);
    }
    const acima = [...por].filter(([, l]) => l.length > lim.wipPorPessoa).sort(([x], [y]) => x.localeCompare(y, 'pt-BR'));
    return { itens: [], resumo: acima.map(([nome, l]) => `${nome}: ${l.map((i) => `#${i.id}`).join(', ')}`).join('\n') };
  }
  return { itens: [] };
}

/** Work items by problem kind (RF-05), with the owner's name when there is one. */
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
    .map((i) => ({ id: i.id, tipo: i.tipo, estado: i.estado, titulo: i.titulo, diasNoEstado: dias(i), ...(i.donoNome ? { responsavel: i.donoNome } : {}) }));
}

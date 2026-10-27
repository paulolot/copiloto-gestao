/**
 * boards_gargalos — where work items pile up on the board and for how long (read only)
 * Time in a column is counted in business days (Mon–Fri, America/Sao_Paulo) from the last move into the
 * current column (revisions), or from the last state change when the column never moved. Brazilian national
 * holidays do not count (others, such as Carnival or a city holiday, come from FERIADOS_EXTRAS=AAAA-MM-DD,...). The ranking is of columns; owners are item data only.
 */
import type { Database } from 'sql.js';
import { COLUNAS, colunaDesconhecida, posicaoColuna } from './colunas.js';
import { mediana } from './metricas.js';

const FUSO = 'America/Sao_Paulo';
const FINAIS = ['closed', 'done', 'removed'];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Edit distance, to place a misspelled column next to the one it was meant to be. */
function distancia(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Board order as Paulo's boards show it: UX (Retaguarda WEB only) sits between Ideias and Backlog. */
const ORDEM_BOARD: string[] = [COLUNAS[0].nome, 'UX', ...COLUNAS.slice(1).map((c) => c.nome)];
const POS_BOARD = new Map(ORDEM_BOARD.map((n, i) => [norm(n), i]));
const BACKLOG = ['ideias', 'backlog', 'new'];

export const TIPOS_PADRAO_GARGALOS = ['User Story', 'Bug', 'Task'];

export interface OpcoesGargalos {
  limiteDiasUteis?: number;
  tipos?: string[];
  top?: number;
  incluirBacklog?: boolean;
  agora?: Date;
}

const diaSp = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(d);
/** Brazil has had no daylight saving time since 2019, so the offset is fixed. */
export const dataHoraSp = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'medium' }).format(d).replace(' ', 'T') + '-03:00';

/** Easter Sunday (Meeus/Jones/Butcher), as a UTC timestamp. */
function pascoa(ano: number): number {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(ano, mes - 1, dia);
}

/** National holidays of a year (AAAA-MM-DD): the fixed ones and Good Friday. Dia da Consciência Negra is national since 2024. */
export function feriadosNacionais(ano: number): string[] {
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];
  if (ano >= 2024) fixos.push('11-20');
  const sextaSanta = new Date(pascoa(ano) - 2 * 86_400_000).toISOString().slice(0, 10);
  return [...fixos.map((d) => `${ano}-${d}`), sextaSanta].sort();
}

/** Extra non-working days (Carnival, Corpus Christi, state or city holidays), comma separated AAAA-MM-DD. */
export function feriadosExtras(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.FERIADOS_EXTRAS ?? '').split(',').map((x) => x.trim()).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
}

/** Business days after the São Paulo day of `de`, up to and including the day of `ate`: Mon–Fri, minus holidays. */
export function diasUteisSp(de: Date, ate: Date, extras: string[] = feriadosExtras()): number {
  const [a, b] = [diaSp(de), diaSp(ate)].map((x) => Date.parse(x + 'T00:00:00Z'));
  const feriados = new Set(extras);
  for (let ano = new Date(a).getUTCFullYear(); ano <= new Date(b).getUTCFullYear(); ano++) feriadosNacionais(ano).forEach((f) => feriados.add(f));
  let n = 0;
  for (let t = a + 86_400_000; t <= b; t += 86_400_000) {
    const w = new Date(t).getUTCDay();
    if (w !== 0 && w !== 6 && !feriados.has(new Date(t).toISOString().slice(0, 10))) n++;
  }
  return n;
}

const arred = (n: number) => Math.round(n * 10) / 10;

interface Linha {
  id: number; tipo: string; estado: string; titulo: string; coluna?: string; dono?: string; donoNome?: string;
  colunaDesde?: string; estadoDesde?: string; alteradoEm?: string; criadoEm?: string;
}

export function gargalosDoTime(db: Database, timeId: string, opts: OpcoesGargalos = {}) {
  const agora = opts.agora ?? new Date();
  const limite = opts.limiteDiasUteis ?? 3;
  const top = opts.top ?? 5;
  const tipos = (opts.tipos?.length ? opts.tipos : TIPOS_PADRAO_GARGALOS).map(norm);

  const linhas = (db.exec(
    `SELECT id, tipo, estado, titulo, coluna, dono, dono_nome, coluna_desde, estado_desde, mudanca_estado_em, alterado_em, criado_em
       FROM work_items WHERE time_id = ?`, [timeId])[0]?.values ?? []).map((v): Linha & { mudancaEstadoEm?: string } => ({
    id: v[0] as number, tipo: v[1] as string, estado: v[2] as string, titulo: (v[3] as string) ?? '', coluna: (v[4] as string) ?? undefined,
    dono: (v[5] as string) ?? undefined, donoNome: (v[6] as string) ?? undefined, colunaDesde: (v[7] as string) ?? undefined,
    estadoDesde: (v[8] as string) ?? undefined, mudancaEstadoEm: (v[9] as string) ?? undefined, alteradoEm: (v[10] as string) ?? undefined,
    criadoEm: (v[11] as string) ?? undefined,
  })).filter((i) => tipos.includes(norm(i.tipo)) && !FINAIS.includes(i.estado.toLowerCase()));

  type Item = { id: number; titulo: string; tipo: string; responsavel: string; dias_uteis_na_coluna: number; data_origem: string };
  type Grupo = { nome: string; estados: Map<string, number>; itens: Item[] };
  const colunas = new Map<string, Grupo>();
  let semDataDeColuna = 0;

  for (const i of linhas) {
    // No board column: the item sits where its state puts it (New = Backlog)
    const col = (i.coluna ?? '').trim() || (i.estado === 'New' ? 'Backlog' : 'Dev implementando');
    const p = posicaoColuna(col);
    if (p !== undefined && COLUNAS[p].estado === 'Closed') continue;
    if (FINAIS.includes(norm(col))) continue;
    if (!opts.incluirBacklog && BACKLOG.includes(norm(col))) continue;
    const k = norm(col);
    const g: Grupo = colunas.get(k) ?? { nome: p !== undefined ? COLUNAS[p].nome : col, estados: new Map(), itens: [] };
    g.estados.set(i.estado, (g.estados.get(i.estado) ?? 0) + 1);

    const dataEstado = i.estadoDesde ?? i.mudancaEstadoEm;
    const origem: [string, string] = i.colunaDesde ? ['coluna', i.colunaDesde]
      : dataEstado ? ['estado', dataEstado] : ['alteracao', (i.alteradoEm ?? i.criadoEm)!];
    if (origem[0] !== 'coluna') semDataDeColuna++;
    const desde = new Date(origem[1]);
    g.itens.push({
      id: i.id, titulo: i.titulo, tipo: i.tipo, responsavel: i.donoNome ?? i.dono ?? 'sem responsável',
      dias_uteis_na_coluna: Number.isNaN(desde.getTime()) ? 0 : diasUteisSp(desde, agora),
      data_origem: origem[0] === 'coluna' ? 'mudanca_de_coluna' : origem[0] === 'estado' ? 'mudanca_de_estado' : 'ultima_alteracao',
    });
    colunas.set(k, g);
  }

  const posOrdem = (nome: string, estados: Map<string, number>) => {
    const p = POS_BOARD.get(norm(nome));
    if (p !== undefined) return p;
    // A misspelled name goes right after the column it is closest to (up to 3 letters off)
    const perto = ORDEM_BOARD.map((n, i) => ({ i, d: distancia(norm(n), norm(nome)) })).sort((x, y) => x.d - y.d)[0];
    if (perto && perto.d <= 3) return perto.i + 0.1;
    // Otherwise right after the last known column of its dominant state
    const dom = [...estados.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'Active';
    const ultimo = COLUNAS.map((c, n) => (c.estado === dom ? n : -1)).reduce((x, y) => Math.max(x, y), -1);
    return (ultimo < 0 ? ORDEM_BOARD.length : ultimo + 1) + 0.5;
  };

  const lista = [...colunas.values()]
    .map((g) => {
      const dias = g.itens.map((i) => i.dias_uteis_na_coluna);
      const ordenados = [...g.itens].sort((a, b) => b.dias_uteis_na_coluna - a.dias_uteis_na_coluna || a.id - b.id);
      const naoMapeada = colunaDesconhecida(g.nome);
      return {
        coluna: g.nome,
        ...(naoMapeada ? { coluna_nao_mapeada: true, posicao_aproximada: true } : {}),
        itens: g.itens.length,
        itens_acima_do_limite: dias.filter((d) => d > limite).length,
        media_dias_uteis: arred(dias.reduce((a, b) => a + b, 0) / dias.length),
        mediana_dias_uteis: arred(mediana(dias) ?? 0),
        maior_tempo_dias_uteis: Math.max(...dias),
        itens_mais_antigos: ordenados.slice(0, top).map(({ id, titulo, tipo, responsavel, dias_uteis_na_coluna, data_origem }) => ({ id, titulo, tipo, responsavel, dias_uteis_na_coluna, data_origem })),
        _ordem: posOrdem(g.nome, g.estados),
      };
    })
    .sort((a, b) => a._ordem - b._ordem);

  const ranking = [...lista]
    .sort((a, b) => b.itens_acima_do_limite - a.itens_acima_do_limite || b.maior_tempo_dias_uteis - a.maior_tempo_dias_uteis || a._ordem - b._ordem)
    .map((c, n) => ({ posicao: n + 1, coluna: c.coluna, itens_acima_do_limite: c.itens_acima_do_limite, maior_tempo_dias_uteis: c.maior_tempo_dias_uteis }));

  return {
    colunas: lista.map(({ _ordem, ...c }) => c),
    ranking_colunas: ranking,
    itens_sem_data_de_coluna: semDataDeColuna,
  };
}

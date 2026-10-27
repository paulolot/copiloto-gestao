/**
 * boards_gargalos — where work items pile up on the board and for how long (read only)
 * Time in a column is counted in business days (Mon–Fri, America/Sao_Paulo) from the last move into the
 * current column (revisions), or from the last state change when the column never moved. Holidays are not
 * known to the bridge, so they count as business days. The ranking is of columns; owners are item data only.
 */
import type { Database } from 'sql.js';
import { COLUNAS, colunaDesconhecida, posicaoColuna } from './colunas.js';
import { mediana } from './metricas.js';

const FUSO = 'America/Sao_Paulo';
const FINAIS = ['closed', 'done', 'removed'];
const BACKLOG = ['ideias', 'backlog', 'new'];

export const TIPOS_PADRAO_GARGALOS = ['User Story', 'Bug', 'Task'];

export interface OpcoesGargalos {
  limiteDiasUteis?: number;
  tipos?: string[];
  top?: number;
  incluirBacklog?: boolean;
  agora?: Date;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const diaSp = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(d);
/** Brazil has had no daylight saving time since 2019, so the offset is fixed. */
export const dataHoraSp = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'medium' }).format(d).replace(' ', 'T') + '-03:00';

/** Weekdays after the São Paulo day of `de`, up to and including the day of `ate`. */
export function diasUteisSp(de: Date, ate: Date): number {
  const [a, b] = [diaSp(de), diaSp(ate)].map((s) => Date.parse(s + 'T00:00:00Z'));
  let n = 0;
  for (let t = a + 86_400_000; t <= b; t += 86_400_000) {
    const w = new Date(t).getUTCDay();
    if (w !== 0 && w !== 6) n++;
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
    const p = posicaoColuna(nome);
    if (p !== undefined) return p;
    // A column the bridge does not place goes right after the last known column of its dominant state
    const dom = [...estados.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Active';
    const ultimo = COLUNAS.map((c, n) => (c.estado === dom ? n : -1)).reduce((a, b) => Math.max(a, b), -1);
    return (ultimo < 0 ? COLUNAS.length : ultimo) + 0.5;
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

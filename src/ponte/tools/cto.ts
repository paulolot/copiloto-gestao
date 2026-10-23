/**
 * T2.9 — Attention points and decisions for the CTO meeting (RF-25, RF-37).
 * - Attention points (`cto/pontos-de-atencao/`): what I saw · since when · what I already did · what may happen · what I need.
 *   No point goes to the agenda without "what I already did": the tools flag it and `cto_pauta_salvar` refuses it.
 * - Pending decisions (`cto/decisoes-pendentes/`): problem · options · recommendation · what happens if nothing is decided.
 * - `ctoPautaDados` gathers everything the Porta-voz needs; the agenda itself is written by the routine and stored
 *   with `ctoPautaSalvar` (revisado: false). Nothing here sends anything to the CTO: that only goes through the approval queue.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Database } from 'sql.js';
import { diasUteisEntre } from '../azure/metricas.js';
import { sinaisAtivos, type Severidade, type SinalRegistrado } from '../azure/alertas.js';
import { timesAtivos } from '../azure/escopo.js';
import { boardsMarcos, metricasTime } from './boards.js';
import { lerFrontmatter, texto } from './frontmatter.js';
import { hojeSp, TIME_SINAIS_1X1 } from './um-a-um.js';
import { getVaultRoot, slugify, vaultLer, vaultListar } from './vault.js';

export const CADENCIA_CTO_DIAS = Number(process.env.CTO_CADENCIA_DIAS) || 15;
/** Yellow signals older than this many business days become candidates to an attention point. */
export const SINAL_CANDIDATO_DIAS_UTEIS = Number(process.env.CTO_SINAL_DIAS_UTEIS) || 3;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DIA = 86_400_000;

type Chave = string;
interface TipoItem {
  dir: string;
  tipo: string;
  rotulo: string;
  secoes: { chave: Chave; titulo: string }[];
  /** Needed before it may go to the agenda. */
  obrigatorias: Chave[];
  /** Nice to have; reported, not blocking. */
  recomendadas: Chave[];
}

export const PONTO: TipoItem = {
  dir: 'cto/pontos-de-atencao', tipo: 'atencao', rotulo: 'ponto de atenção',
  secoes: [
    { chave: 'o_que_vi', titulo: 'O que vi' },
    { chave: 'ja_fiz', titulo: 'O que já fiz' },
    { chave: 'pode_acontecer', titulo: 'O que pode acontecer' },
    { chave: 'preciso', titulo: 'O que preciso do CTO' },
  ],
  obrigatorias: ['o_que_vi', 'ja_fiz'], recomendadas: ['pode_acontecer', 'preciso'],
};
export const DECISAO: TipoItem = {
  dir: 'cto/decisoes-pendentes', tipo: 'decisao-cto', rotulo: 'decisão pendente',
  secoes: [
    { chave: 'problema', titulo: 'Problema' },
    { chave: 'opcoes', titulo: 'Opções' },
    { chave: 'recomendacao', titulo: 'Recomendação' },
    { chave: 'se_nada', titulo: 'Se nada for decidido' },
  ],
  obrigatorias: ['problema', 'opcoes', 'recomendacao', 'se_nada'], recomendadas: [],
};

export type StatusItem = 'aberto' | 'resolvido' | 'descartado';
export const STATUS_ITEM: StatusItem[] = ['aberto', 'resolvido', 'descartado'];

export interface Item {
  id: string;
  caminho: string;
  titulo: string;
  status: StatusItem;
  aberto_em?: string;
  atualizado_em?: string;
  desde?: string;
  sinal?: string;
  campos: Record<Chave, string>;
  resolucao?: string;
  pronto_para_pauta: boolean;
  faltando: string[];
  recomendado_completar: string[];
}

const limpar = (s?: string) => (s ?? '').trim();

function parseSecoes(corpo: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const bloco of corpo.split(/^##\s+/m).slice(1)) {
    const i = bloco.indexOf('\n');
    m.set(bloco.slice(0, i < 0 ? undefined : i).trim(), i < 0 ? '' : bloco.slice(i + 1).trim());
  }
  return m;
}

function montar(t: TipoItem, f: { titulo: string; status: StatusItem; aberto_em: string; atualizado_em: string; desde?: string; sinal?: string; fontes?: string[]; campos: Record<Chave, string>; resolucao?: string; extras?: Map<string, string> }): string {
  const fm = [
    `tipo: ${t.tipo}`, `titulo: ${JSON.stringify(f.titulo)}`, `status: ${f.status}`, `aberto_em: ${f.aberto_em}`, `atualizado_em: ${f.atualizado_em}`,
    ...(f.desde ? [`desde: ${f.desde}`] : []), ...(f.sinal ? [`sinal: ${JSON.stringify(f.sinal)}`] : []),
    ...(f.fontes?.length ? ['fonte:', ...f.fontes.map((x) => `  - ${JSON.stringify(x)}`)] : ['fonte: []']),
    'origem: copiloto', 'revisado: false',
  ].join('\n');
  const secoes = t.secoes.map((s) => `## ${s.titulo}\n\n${limpar(f.campos[s.chave]) || '[a completar]'}`);
  const conhecidos = new Set([...t.secoes.map((s) => s.titulo), 'Resolução']);
  const extras = [...(f.extras ?? [])].filter(([k]) => !conhecidos.has(k)).map(([k, v]) => `## ${k}\n\n${v}`);
  return `---\n${fm}\n---\n\n${[...secoes, ...(f.resolucao ? [`## Resolução\n\n${f.resolucao.trim()}`] : []), ...extras].join('\n\n')}\n`;
}

function lerItem(t: TipoItem, arquivo: string): Item {
  const caminho = `${t.dir}/${arquivo}`;
  const { campos: fm, corpo } = lerFrontmatter(vaultLer(caminho));
  const secoes = parseSecoes(corpo);
  const campos: Record<Chave, string> = {};
  for (const s of t.secoes) { const v = limpar(secoes.get(s.titulo)); campos[s.chave] = v === '[a completar]' ? '' : v; }
  const status = (STATUS_ITEM as string[]).includes(texto(fm.status) ?? '') ? (texto(fm.status) as StatusItem) : 'aberto';
  const desde = texto(fm.desde);
  const faltando = [...t.obrigatorias.filter((c) => !campos[c]).map((c) => t.secoes.find((s) => s.chave === c)!.titulo), ...(t === PONTO && !desde ? ['Desde quando'] : [])];
  return {
    id: arquivo.replace(/\.md$/, ''), caminho, titulo: texto(fm.titulo) ?? arquivo, status, aberto_em: texto(fm.aberto_em), atualizado_em: texto(fm.atualizado_em), desde, sinal: texto(fm.sinal),
    campos, resolucao: limpar(secoes.get('Resolução')) || undefined,
    pronto_para_pauta: status === 'aberto' && !faltando.length, faltando,
    recomendado_completar: t.recomendadas.filter((c) => !campos[c]).map((c) => t.secoes.find((s) => s.chave === c)!.titulo),
  };
}

function arquivos(t: TipoItem): string[] {
  try { return vaultListar(t.dir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort(); } catch { return []; }
}

export function listarItens(t: TipoItem, status?: StatusItem): Item[] {
  return arquivos(t).map((a) => lerItem(t, a)).filter((i) => !status || i.status === status);
}

function gravarNovo(t: TipoItem, data: string, titulo: string, conteudoDe: (id: string) => string): { id: string; caminho: string } {
  const dir = join(getVaultRoot(), t.dir);
  mkdirSync(dir, { recursive: true });
  const base = `${data}-${slugify(titulo).slice(0, 60)}`;
  for (let n = 0; ; n++) {
    const id = n === 0 ? base : `${base}-${n + 1}`;
    try {
      writeFileSync(join(dir, `${id}.md`), conteudoDe(id), { encoding: 'utf8', flag: 'wx' });
      return { id, caminho: `${t.dir}/${id}.md` };
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  }
}

function acharItem(t: TipoItem, id: string): Item {
  const alvo = id.trim().replace(/\.md$/, '');
  const a = arquivos(t).find((f) => f.replace(/\.md$/, '') === alvo);
  if (!a) throw new Error(`${t.rotulo[0].toUpperCase()}${t.rotulo.slice(1)} "${id}" não encontrado. Ids: ${arquivos(t).map((f) => f.replace(/\.md$/, '')).join(', ') || 'nenhum'}`);
  return lerItem(t, a);
}

// ---- attention points ----------------------------------------------------------------------------

export interface NovoPonto {
  titulo: string;
  o_que_vi: string;
  /** AAAA-MM-DD. Not needed when `sinal` is given: the date comes from the signal. */
  desde?: string;
  /** `time:chave` of a dated signal (see ponto_atencao_candidatos). */
  sinal?: string;
  ja_fiz?: string;
  pode_acontecer?: string;
  preciso?: string;
  fontes?: string[];
}

function dadosDoSinal(db: Database, ref: string): { desde: string; descricao: string } {
  const i = ref.indexOf(':');
  const [time, chave] = i < 0 ? ['', ref] : [ref.slice(0, i), ref.slice(i + 1)];
  const r = db.exec('SELECT desde, descricao FROM sinais WHERE time_id = ? AND chave = ?', [time, chave])[0]?.values[0];
  if (!r) throw new Error(`Sinal "${ref}" não encontrado. Use o formato time:chave de ponto_atencao_candidatos`);
  return { desde: hojeSp(new Date(r[0] as string)), descricao: r[1] as string };
}

export function pontoAtencaoRegistrar(db: Database, p: NovoPonto, agora = new Date()): { id: string; caminho: string; aviso?: string } {
  if (!p.titulo.trim()) throw new Error('Informe o título');
  if (!p.o_que_vi.trim()) throw new Error('Informe o que você viu');
  const hoje = hojeSp(agora);
  let desde = p.desde;
  if (p.sinal) desde = dadosDoSinal(db, p.sinal).desde;
  if (!desde) throw new Error('Informe desde quando (AAAA-MM-DD) ou o sinal datado de onde isso veio');
  if (!ISO.test(desde)) throw new Error('A data "desde" deve estar no formato AAAA-MM-DD');
  const r = gravarNovo(PONTO, hoje, p.titulo, () => montar(PONTO, {
    titulo: p.titulo.trim(), status: 'aberto', aberto_em: hoje, atualizado_em: hoje, desde, sinal: p.sinal, fontes: p.fontes,
    campos: { o_que_vi: limpar(p.o_que_vi), ja_fiz: limpar(p.ja_fiz), pode_acontecer: limpar(p.pode_acontecer), preciso: limpar(p.preciso) },
  }));
  return { ...r, ...(limpar(p.ja_fiz) ? {} : { aviso: 'Falta "o que já fiz": este ponto não vai à pauta enquanto não houver uma ação já tomada.' }) };
}

export interface AtualizacaoItem {
  id: string;
  status?: StatusItem;
  titulo?: string;
  resolucao?: string;
  campos?: Record<Chave, string | undefined>;
  desde?: string;
}

function atualizar(t: TipoItem, a: AtualizacaoItem, agora: Date): Item {
  const atual = acharItem(t, a.id);
  const { campos: fm, corpo } = lerFrontmatter(vaultLer(atual.caminho));
  const extras = parseSecoes(corpo);
  const campos = { ...atual.campos };
  for (const [k, v] of Object.entries(a.campos ?? {})) {
    if (!t.secoes.some((s) => s.chave === k)) throw new Error(`Campo desconhecido "${k}". Use: ${t.secoes.map((s) => s.chave).join(', ')}`);
    if (v !== undefined) campos[k] = limpar(v);
  }
  if (a.status && !STATUS_ITEM.includes(a.status)) throw new Error(`Status inválido. Use: ${STATUS_ITEM.join(', ')}`);
  if (a.desde && !ISO.test(a.desde)) throw new Error('A data "desde" deve estar no formato AAAA-MM-DD');
  const fontes = Array.isArray(fm.fonte) ? fm.fonte : [];
  const novo = montar(t, {
    titulo: a.titulo?.trim() || atual.titulo, status: a.status ?? atual.status, aberto_em: atual.aberto_em ?? hojeSp(agora), atualizado_em: hojeSp(agora),
    desde: a.desde ?? atual.desde, sinal: atual.sinal, fontes, campos, resolucao: a.resolucao ?? atual.resolucao, extras,
  });
  writeFileSync(join(getVaultRoot(), atual.caminho), novo, 'utf8');
  return lerItem(t, `${atual.id}.md`);
}

export const pontoAtencaoAtualizar = (a: AtualizacaoItem, agora = new Date()) => atualizar(PONTO, a, agora);
export const pontoAtencaoListar = (status?: StatusItem) => listarItens(PONTO, status);

// ---- decisions -------------------------------------------------------------------------------------

export interface NovaDecisao {
  titulo: string;
  problema: string;
  opcoes?: string[];
  recomendacao?: string;
  se_nada?: string;
  fontes?: string[];
}

export function decisaoCtoRegistrar(d: NovaDecisao, agora = new Date()): { id: string; caminho: string; aviso?: string } {
  if (!d.titulo.trim()) throw new Error('Informe o título');
  if (!d.problema.trim()) throw new Error('Informe o problema');
  const hoje = hojeSp(agora);
  const opcoes = (d.opcoes ?? []).map((o) => o.trim()).filter(Boolean).map((o, i) => `${i + 1}. ${o}`).join('\n');
  const r = gravarNovo(DECISAO, hoje, d.titulo, () => montar(DECISAO, {
    titulo: d.titulo.trim(), status: 'aberto', aberto_em: hoje, atualizado_em: hoje, fontes: d.fontes,
    campos: { problema: limpar(d.problema), opcoes, recomendacao: limpar(d.recomendacao), se_nada: limpar(d.se_nada) },
  }));
  const item = lerItem(DECISAO, `${r.id}.md`);
  return { ...r, ...(item.faltando.length ? { aviso: `Ainda falta: ${item.faltando.join(', ')}. A decisão só vai à pauta completa (problema, opções, recomendação e o que acontece se nada for decidido).` } : {}) };
}

export const decisaoCtoAtualizar = (a: AtualizacaoItem, agora = new Date()) => atualizar(DECISAO, a, agora);
export const decisaoCtoListar = (status?: StatusItem) => listarItens(DECISAO, status);

// ---- candidates ------------------------------------------------------------------------------------

export interface CandidatoPonto {
  sinal: string;
  time: string;
  descricao: string;
  severidade: Severidade;
  desde: string;
  dias_uteis: number;
  motivo: string;
}

/**
 * Dated signals that could become attention points (Paulo decides): yellow for more than N business days,
 * milestones at risk and overdue 1:1s. Signals already linked to an open point are left out.
 */
export function pontoAtencaoCandidatos(db: Database, agora = new Date()): CandidatoPonto[] {
  const ligados = new Set(listarItens(PONTO, 'aberto').map((i) => i.sinal).filter((s): s is string => !!s));
  const out: CandidatoPonto[] = [];
  for (const s of sinaisAtivos(db)) {
    const ref = `${s.time}:${s.chave}`;
    if (ligados.has(ref)) continue;
    const dias = diasUteisEntre(new Date(s.desde), agora);
    let motivo: string | undefined;
    if (s.time === 'marcos') motivo = 'marco em risco';
    else if (s.time === TIME_SINAIS_1X1) motivo = s.chave.startsWith('pdi:') ? 'revisão de PDI vencida' : '1:1 atrasado';
    else if (s.severidade === 'amarelo' && dias > SINAL_CANDIDATO_DIAS_UTEIS) motivo = `sinal amarelo há mais de ${SINAL_CANDIDATO_DIAS_UTEIS} dias úteis`;
    else if (s.severidade === 'vermelho') motivo = 'sinal vermelho';
    if (motivo) out.push({ sinal: ref, time: s.time, descricao: s.descricao, severidade: s.severidade, desde: s.desde, dias_uteis: dias, motivo });
  }
  return out.sort((a, b) => a.desde.localeCompare(b.desde));
}

// ---- agenda data -----------------------------------------------------------------------------------

const PAUTA = /^(\d{4}-\d{2}-\d{2})-pauta(?:-\d+)?\.md$/;

export function ultimaPautaCto(): { data: string; caminho: string } | null {
  let achados: string[] = [];
  try { achados = vaultListar('cto').filter((f) => PAUTA.test(f)).sort(); } catch { /* no cto/ folder yet */ }
  const f = achados[achados.length - 1];
  return f ? { data: PAUTA.exec(f)![1], caminho: `cto/${f}` } : null;
}

const somarDias = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DIA).toISOString().slice(0, 10);

export function ctoPautaDados(db: Database, opts: { desde?: string } = {}, agora = new Date()): Record<string, unknown> {
  const hoje = hojeSp(agora);
  const avisos: string[] = [];
  const ultima = ultimaPautaCto();
  const diasDesde = ultima ? Math.round((Date.parse(hoje) - Date.parse(ultima.data)) / DIA) : null;
  const desde = opts.desde ?? ultima?.data ?? somarDias(hoje, -CADENCIA_CTO_DIAS);
  if (!ISO.test(desde)) throw new Error('A data "desde" deve estar no formato AAAA-MM-DD');

  // achievements (credit goes to teams)
  const conquistas: { caminho: string; titulo?: string; data?: string; times: string[]; fontes: string[] }[] = [];
  try {
    for (const f of vaultListar('conquistas').filter((x) => x.endsWith('.md') && !x.startsWith('_')).sort().reverse()) {
      const caminho = `conquistas/${f}`;
      const { campos } = lerFrontmatter(vaultLer(caminho));
      const data = texto(campos.data);
      if (texto(campos.revisado) !== 'true' || (data ?? '') < desde) continue;
      conquistas.push({ caminho, titulo: texto(campos.titulo), data, times: Array.isArray(campos.times) ? campos.times : [], fontes: Array.isArray(campos.fonte) ? campos.fonte : [] });
    }
  } catch { /* no conquistas/ folder */ }
  let aguardando = 0;
  try {
    for (const f of vaultListar('inbox').filter((x) => x.endsWith('.md'))) {
      const { campos } = lerFrontmatter(vaultLer(`inbox/${f}`));
      if (texto(campos.tipo) === 'conquista' && texto(campos.revisado) !== 'true' && (texto(campos.data) ?? '') >= desde) aguardando++;
    }
  } catch { /* no inbox/ folder */ }
  if (aguardando) avisos.push(`${aguardando} conquista(s) em inbox/ aguardam a sua revisão (revisado: true) e ainda não entram na pauta`);

  const pontos = listarItens(PONTO, 'aberto');
  const decisoes = listarItens(DECISAO, 'aberto');
  const resumo = (i: Item) => ({ id: i.id, caminho: i.caminho, titulo: i.titulo, desde: i.desde, sinal: i.sinal, ...i.campos });

  const sinais: (SinalRegistrado & { dias_uteis: number })[] = sinaisAtivos(db).filter((s) => s.time !== TIME_SINAIS_1X1).map((s) => ({ ...s, dias_uteis: diasUteisEntre(new Date(s.desde), agora) }));
  const graves = sinais.filter((s) => s.severidade === 'vermelho' && s.dias_uteis <= 2);

  let marcos: unknown = null;
  try { marcos = JSON.parse(boardsMarcos(db, {}, agora)); } catch (e) { avisos.push(`Marcos indisponíveis: ${(e as Error).message}`); }
  const times: unknown[] = [];
  for (const t of timesAtivos()) {
    try {
      const m = JSON.parse(metricasTime(db, t.id, 'atual', agora)) as { time: string; abertos: number; cycleTime: unknown; leadTime: unknown; throughputSemanal: { entregues: number }[]; bugRateJanelas: unknown };
      times.push({ time: m.time, abertos: m.abertos, cycleTime: m.cycleTime, leadTime: m.leadTime, entreguesUltimas4Semanas: m.throughputSemanal.slice(-4).reduce((a, x) => a + x.entregues, 0), bugRate: m.bugRateJanelas });
    } catch (e) { avisos.push(`Métricas de ${t.nome} indisponíveis: ${(e as Error).message}`); }
  }

  return {
    hoje, desde,
    cadencia: {
      ultima_pauta: ultima, dias_desde_a_ultima: diasDesde, cadencia_dias: CADENCIA_CTO_DIAS,
      proxima_devida: ultima ? somarDias(ultima.data, CADENCIA_CTO_DIAS) : hoje,
      devida: diasDesde === null || diasDesde >= CADENCIA_CTO_DIAS,
    },
    conquistas,
    decisoes_pendentes: { prontas: decisoes.filter((d) => d.pronto_para_pauta).map(resumo), incompletas: decisoes.filter((d) => !d.pronto_para_pauta).map((d) => ({ id: d.id, titulo: d.titulo, faltando: d.faltando })) },
    pontos_de_atencao: {
      prontos_para_pauta: pontos.filter((p) => p.pronto_para_pauta).map(resumo),
      sem_acao_ja_tomada: pontos.filter((p) => !p.pronto_para_pauta).map((p) => ({ id: p.id, titulo: p.titulo, faltando: p.faltando })),
      regra: 'Nenhum ponto vai à pauta sem "o que já fiz". Os de sem_acao_ja_tomada ficam de fora até o Paulo completar.',
    },
    candidatos_a_ponto_de_atencao: pontoAtencaoCandidatos(db, agora),
    sinais_dos_boards: sinais,
    graves_recentes: graves,
    sugestao_aviso: graves.length ? 'Há sinal vermelho novo. Se o Paulo concordar, proponha um aviso curto ao CTO com mensagem_propor (nada é enviado sem o OK dele).' : null,
    marcos, times, avisos,
  };
}

// ---- storing the agenda ----------------------------------------------------------------------------

export interface PautaCto {
  texto: string;
  fontes: string[];
  /** Ids of the attention points the agenda includes; each must be open and have "o que já fiz". */
  pontos_incluidos: string[];
  /** Ids of the pending decisions the agenda includes; each must be complete. */
  decisoes_incluidas?: string[];
}

/** Stores the agenda (cto/AAAA-MM-DD-pauta.md, revisado: false). Refuses a point without an action already taken. */
export function ctoPautaSalvar(p: PautaCto, agora = new Date()): string {
  if (!p.texto.trim()) throw new Error('O texto da pauta está vazio');
  const fontes = p.fontes.map((f) => f.trim()).filter(Boolean);
  if (!fontes.length) throw new Error('Toda pauta cita as fontes (notas, work items, sinais com data)');
  for (const id of p.pontos_incluidos) {
    const i = acharItem(PONTO, id);
    if (!i.pronto_para_pauta) throw new Error(`O ponto "${i.id}" não pode ir à pauta: ${i.status !== 'aberto' ? `está ${i.status}` : `falta ${i.faltando.join(', ')}`}. Nenhum ponto vai sem "o que já fiz"`);
  }
  for (const id of p.decisoes_incluidas ?? []) {
    const i = acharItem(DECISAO, id);
    if (!i.pronto_para_pauta) throw new Error(`A decisão "${i.id}" não pode ir à pauta: ${i.status !== 'aberto' ? `está ${i.status}` : `falta ${i.faltando.join(', ')}`}`);
  }
  const hoje = hojeSp(agora);
  const dir = join(getVaultRoot(), 'cto');
  mkdirSync(dir, { recursive: true });
  const lista = (l?: string[]) => (l?.length ? l.map((x) => `  - ${JSON.stringify(x)}`).join('\n') : ' []');
  const conteudo = `---
tipo: pauta-cto
titulo: ${JSON.stringify(`Reunião quinzenal CTO — ${hoje}`)}
data: ${hoje}
fonte:
${fontes.map((f) => `  - ${JSON.stringify(f)}`).join('\n')}
pontos_de_atencao:${lista(p.pontos_incluidos)}
decisoes:${lista(p.decisoes_incluidas)}
origem: copiloto
revisado: false
---

${p.texto.trim()}
`;
  for (let n = 0; ; n++) {
    const arq = `${hoje}-pauta${n === 0 ? '' : `-${n + 1}`}.md`;
    try {
      writeFileSync(join(dir, arq), conteudo, { encoding: 'utf8', flag: 'wx' });
      return `cto/${arq}`;
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  }
}


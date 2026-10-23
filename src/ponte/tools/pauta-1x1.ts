/**
 * T2.6 — 1:1 agenda (RF-22). Two restricted-area steps:
 * - `umAUmPreparar` gathers everything the Coach needs (PDI progress, agreements of the last 1:1, board signals,
 *   records since the last 1:1, team achievements, suggested topics) as data with sources, never an opinion.
 * - `umAUmSalvarPauta` stores the agenda the Coach wrote at pessoas/<nome>/1x1/AAAA-MM-DD-pauta.md
 *   (restricted, revisado: false). Only the path may go to Discord ("Pauta de 1:1 pronta em <caminho>").
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Database } from 'sql.js';
import { limitesDoAmbiente } from '../azure/metricas.js';
import { lerFrontmatter, texto } from './frontmatter.js';
import { pdiLer } from './pdi.js';
import { boardDaPessoa, conquistasDoTime } from './pessoa-perfil.js';
import { hojeSp, umAUmPendentes } from './um-a-um.js';
import { getVaultRoot, pastaPessoa, pessoaLer, pessoaListar } from './vault.js';

const FIXOS = ['perfil.md', 'pdi.md'];
const MAX_TRECHO = 1500;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface TemaSugerido { tema: string; fonte: string }

export interface PreparoUmAUm {
  pessoa: string;
  hoje: string;
  ultimo_1x1: { data: string | null; caminho: string | null; combinados: string[]; sem_conteudo: boolean };
  lembrete: { cadencia?: string; proximo_previsto?: string | null; dias_atraso?: number | null; situacao?: string };
  pdi: { caminho: string; revisado: boolean; proxima_revisao?: string; acoes: { id: string; descricao: string; competencia?: string; prazo?: string; status: string; vencida: boolean }[]; avisos: string[] } | null;
  board: unknown;
  registros_desde_o_ultimo_1x1: { caminho: string; tipo?: string; data?: string; trecho: string }[];
  conquistas_do_time: { caminho: string; titulo?: string }[];
  temas_sugeridos: TemaSugerido[];
  avisos: string[];
}

const dataDoArquivo = (nome: string) => /^(\d{4}-\d{2}-\d{2})/.exec(nome)?.[1];

/** Bullet lines under "## Combinados" (or "## Próximos passos") of a 1:1 note. */
export function combinadosDe(corpo: string): string[] {
  const m = /^##\s+(?:Combinados|Próximos passos)\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im.exec(corpo);
  return m ? m[1].split(/\r?\n/).map((l) => /^\s*[-•*]\s+(.*\S)/.exec(l)?.[1]).filter((x): x is string => !!x && x !== '—') : [];
}

export function umAUmPreparar(db: Database | undefined, pessoa: string, agora = new Date()): PreparoUmAUm {
  if (!pessoa.trim()) throw new Error('Informe a pessoa');
  const pasta = pastaPessoa(pessoa);
  const base = `pessoas/${pasta}`;
  const hoje = hojeSp(agora);
  const avisos: string[] = [];

  let perfilTxt: string | undefined;
  try { perfilTxt = pessoaLer(`${base}/perfil.md`); } catch { avisos.push('Sem perfil.md: papel, time e cadência desconhecidos'); }
  const perfil = perfilTxt ? lerFrontmatter(perfilTxt).campos : undefined;
  const nome = (perfil && texto(perfil.pessoa)) || pessoa.trim();
  const time = perfil ? texto(perfil.time) : undefined;

  // last 1:1 held (a generated agenda does not count)
  const dir1x1 = join(getVaultRoot(), base, '1x1');
  const feitos = existsSync(dir1x1) ? readdirSync(dir1x1).filter((f) => f.endsWith('.md') && !f.startsWith('_') && !/pauta/i.test(f) && dataDoArquivo(f)).sort() : [];
  const ultimoArq = feitos[feitos.length - 1];
  const ultimoData = ultimoArq ? dataDoArquivo(ultimoArq)! : null;
  let combinados: string[] = [];
  let semConteudo = false;
  if (ultimoArq) {
    const { corpo } = lerFrontmatter(pessoaLer(`${base}/1x1/${ultimoArq}`));
    combinados = combinadosDe(corpo);
    semConteudo = /marcador/i.test(corpo) && !combinados.length;
    if (semConteudo) avisos.push('O último 1:1 é só um marcador, sem anotações: não há combinados para retomar');
  } else avisos.push('Nenhum 1:1 registrado');

  const l = umAUmPendentes(agora).um_a_um.find((p) => p.pessoa === nome);
  const lembrete = l ? { cadencia: l.cadencia, proximo_previsto: l.proximo_previsto, dias_atraso: l.dias_atraso, situacao: l.situacao } : {};

  // PDI
  let pdi: PreparoUmAUm['pdi'] = null;
  try {
    const p = pdiLer(pessoa, agora);
    pdi = {
      caminho: p.caminho, revisado: texto(p.campos.revisado) === 'true', proxima_revisao: texto(p.campos.proxima_revisao),
      acoes: p.acoes.map((a) => ({ ...a, vencida: ['aberta', 'em andamento'].includes(a.status) && !!a.prazo && ISO.test(a.prazo) && a.prazo < hoje })),
      avisos: p.avisos,
    };
  } catch { avisos.push('Sem PDI'); }

  // records since the last 1:1
  const registros = pessoaListar(pessoa)
    .filter((c) => !FIXOS.some((f) => c.endsWith(`/${f}`)) && !c.includes('/1x1/'))
    .flatMap((caminho) => {
      const { campos, corpo } = lerFrontmatter(pessoaLer(caminho));
      const data = texto(campos.data) ?? dataDoArquivo(caminho.slice(caminho.lastIndexOf('/') + 1));
      if (ultimoData && (!data || data <= ultimoData)) return [];
      return [{ caminho, tipo: texto(campos.tipo), data, trecho: corpo.trim().slice(0, MAX_TRECHO) }];
    });

  // board
  let board: unknown = null;
  if (db) { const r = boardDaPessoa(db, pessoa, perfil, time); board = r.board; if (r.aviso) avisos.push(r.aviso); }

  const conquistas = time ? conquistasDoTime(time, ultimoData ?? undefined) : [];

  return {
    pessoa: nome, hoje,
    ultimo_1x1: { data: ultimoData, caminho: ultimoArq ? `${base}/1x1/${ultimoArq}` : null, combinados, sem_conteudo: semConteudo },
    lembrete, pdi, board, registros_desde_o_ultimo_1x1: registros, conquistas_do_time: conquistas,
    temas_sugeridos: temasSugeridos({ lembrete, pdi, board, registros: registros.length, hoje }), avisos,
  };
}

/** Facts that deserve a conversation, each with its source: never a verdict about the person. */
function temasSugeridos(d: { lembrete: PreparoUmAUm['lembrete']; pdi: PreparoUmAUm['pdi']; board: unknown; registros: number; hoje: string }): TemaSugerido[] {
  const t: TemaSugerido[] = [];
  const lim = limitesDoAmbiente();
  if (d.lembrete.situacao === 'atrasado') t.push({ tema: `Último 1:1 há mais tempo que a cadência (${d.lembrete.dias_atraso} dia(s) de atraso)`, fonte: 'um_a_um_pendentes' });
  if (d.pdi) {
    const vencidas = d.pdi.acoes.filter((a) => a.vencida);
    if (vencidas.length) t.push({ tema: `Ações do PDI com prazo vencido: ${vencidas.map((a) => a.id).join(', ')}`, fonte: d.pdi.caminho });
    if (!d.pdi.acoes.length) t.push({ tema: 'PDI sem ações definidas', fonte: d.pdi.caminho });
    const semPrazo = d.pdi.acoes.filter((a) => !a.prazo && ['aberta', 'em andamento'].includes(a.status));
    if (semPrazo.length) t.push({ tema: `Ações do PDI sem prazo: ${semPrazo.map((a) => a.id).join(', ')}`, fonte: d.pdi.caminho });
    if (d.pdi.proxima_revisao && d.pdi.proxima_revisao < d.hoje) t.push({ tema: `Revisão do PDI vencida (prevista para ${d.pdi.proxima_revisao})`, fonte: d.pdi.caminho });
  }
  const c = (d.board as { colaboradores?: { colaborador: string; abertos: number; emAndamento: number; wipAcimaDoLimite: boolean; envelhecendo: number; paralisados: number; bugsAbertos: number; bugsExternosAbertos: number; itensAbertos: { id: number; titulo: string; diasNoEstado: number }[] }[] } | null)?.colaboradores?.[0];
  if (c) {
    const parados = c.itensAbertos.filter((i) => i.diasNoEstado >= lim.envelhecimentoDias);
    if (parados.length) t.push({ tema: `Itens parados há ${lim.envelhecimentoDias} dias ou mais: ${parados.slice(0, 5).map((i) => `#${i.id} (${i.diasNoEstado} d)`).join(', ')}`, fonte: 'Azure DevOps (metricas_colaborador)' });
    if (c.wipAcimaDoLimite) t.push({ tema: `WIP acima do limite de ${lim.wipPorPessoa}: ${c.emAndamento} itens em andamento`, fonte: 'Azure DevOps (metricas_colaborador)' });
    if (c.paralisados) t.push({ tema: `${c.paralisados} item(ns) paralisado(s)`, fonte: 'Azure DevOps (metricas_colaborador)' });
    if (c.bugsAbertos) t.push({ tema: `${c.bugsAbertos} bug(s) aberto(s) com a pessoa${c.bugsExternosAbertos ? `, ${c.bugsExternosAbertos} externo(s)` : ''}`, fonte: 'Azure DevOps (metricas_colaborador)' });
  }
  if (d.registros) t.push({ tema: `${d.registros} registro(s) novo(s) desde o último 1:1 (impressões, feedbacks ou combinados)`, fonte: 'pessoa_listar' });
  return t;
}

// ---- saving the agenda ---------------------------------------------------------------------------

export interface PautaEscrita {
  texto: string;
  fontes: string[];
  /** Date of the 1:1 (AAAA-MM-DD); defaults to today. */
  data?: string;
}

/** Stores the agenda written by the Coach. Never overwrites; returns the path (the only thing that may leave the machine). */
export function umAUmSalvarPauta(pessoa: string, p: PautaEscrita, agora = new Date()): string {
  if (!pessoa.trim()) throw new Error('Informe a pessoa');
  if (!p.texto.trim()) throw new Error('O texto da pauta está vazio');
  const fontes = p.fontes.map((f) => f.trim()).filter(Boolean);
  if (!fontes.length) throw new Error('Toda pauta cita as fontes (caminhos de notas, work items, sinais com data)');
  const data = p.data ?? hojeSp(agora);
  if (!ISO.test(data)) throw new Error('A data deve estar no formato AAAA-MM-DD');

  const raiz = getVaultRoot();
  const pasta = pastaPessoa(pessoa);
  let nome = pessoa.trim();
  try { nome = texto(lerFrontmatter(pessoaLer(`pessoas/${pasta}/perfil.md`)).campos.pessoa) ?? nome; } catch { /* no profile: use the name given */ }
  const dir = join(raiz, 'pessoas', pasta, '1x1');
  mkdirSync(dir, { recursive: true });
  const conteudo = `---
tipo: pauta
titulo: ${JSON.stringify(`Pauta de 1:1 — ${nome}`)}
pessoa: ${JSON.stringify(nome)}
data: ${data}
fonte:
${fontes.map((f) => `  - ${JSON.stringify(f)}`).join('\n')}
origem: copiloto
restrito: true
revisado: false
---

${p.texto.trim()}
`;
  for (let n = 0; ; n++) {
    const arq = `${data}-pauta${n === 0 ? '' : `-${n + 1}`}.md`;
    try {
      writeFileSync(join(dir, arq), conteudo, { encoding: 'utf8', flag: 'wx' });
      return `pessoas/${pasta}/1x1/${arq}`;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
}

// ---- recording a 1:1 that happened ---------------------------------------------------------------

export interface UmAUmFeito {
  /** Date the 1:1 happened (AAAA-MM-DD); defaults to today. */
  data?: string;
  temas: string;
  combinados?: string[];
  proximos_passos?: string[];
}

/**
 * Stores a 1:1 that happened at pessoas/<nome>/1x1/AAAA-MM-DD-1x1.md, which is what the reminders count as the
 * last 1:1. Restricted, revisado: false, never overwrites. Returns the path only.
 */
export function umAUmRegistrar(pessoa: string, r: UmAUmFeito, agora = new Date()): string {
  if (!pessoa.trim()) throw new Error('Informe a pessoa');
  if (!r.temas.trim()) throw new Error('Informe o que foi conversado');
  const data = r.data ?? hojeSp(agora);
  if (!ISO.test(data)) throw new Error('A data deve estar no formato AAAA-MM-DD');
  const pasta = pastaPessoa(pessoa);
  let nome = pessoa.trim();
  try { nome = texto(lerFrontmatter(pessoaLer(`pessoas/${pasta}/perfil.md`)).campos.pessoa) ?? nome; } catch { /* no profile: use the name given */ }
  const lista = (l?: string[]) => (l?.map((x) => x.trim()).filter(Boolean).map((x) => `- ${x}`).join('\n')) || '- —';
  const dir = join(getVaultRoot(), 'pessoas', pasta, '1x1');
  mkdirSync(dir, { recursive: true });
  const conteudo = `---
tipo: 1x1
titulo: ${JSON.stringify(`1:1 — ${nome}`)}
pessoa: ${JSON.stringify(nome)}
data: ${data}
origem: copiloto
restrito: true
revisado: false
---

## Temas

${r.temas.trim()}

## Combinados

${lista(r.combinados)}

## Próximos passos

${lista(r.proximos_passos)}
`;
  for (let n = 0; ; n++) {
    const arq = `${data}-1x1${n === 0 ? '' : `-${n + 1}`}.md`;
    try {
      writeFileSync(join(dir, arq), conteudo, { encoding: 'utf8', flag: 'wx' });
      return `pessoas/${pasta}/1x1/${arq}`;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
}

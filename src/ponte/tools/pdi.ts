/**
 * T2.4 — PDI (RF-21). Structured actions inside pessoas/<nome>/pdi.md, one per line:
 *   - [A1] **descrição** — competência: <nome no plano do papel> — prazo: AAAA-MM-DD — status: aberta
 * Restricted area: the tools return data to Paulo's agent and never echo content into shared channels or the log.
 * Everything the Copiloto writes goes back to `revisado: false`. Sharing a PDI with the person always asks Paulo's OK.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Database } from 'sql.js';
import { enforcePolicy } from '../middleware/autonomy.js';
import { lerFrontmatter, texto, type ValorFrontmatter } from './frontmatter.js';
import { competenciasDoPlano, papelLer } from './papeis.js';
import { hojeSp, umAUmPendentes, type PendenciaPdi } from './um-a-um.js';
import { getVaultRoot, pastaPessoa, pessoaLer } from './vault.js';
import { CANAIS_MENSAGEM, type CanalMensagem } from './mensagens.js';

export const STATUS_ACAO = ['aberta', 'em andamento', 'concluída', 'cancelada'] as const;
export type StatusAcao = (typeof STATUS_ACAO)[number];
const ABERTAS: StatusAcao[] = ['aberta', 'em andamento'];

/** Review every N months (Paulo, 23/10/2026: 6). */
export const REVISAO_MESES = Number(process.env.PDI_REVISAO_MESES) || 6;

export interface AcaoPdi {
  id: string;
  descricao: string;
  competencia?: string;
  prazo?: string;
  status: StatusAcao;
}

export interface PdiLido {
  caminho: string;
  campos: Record<string, ValorFrontmatter>;
  objetivo: string;
  acoes: AcaoPdi[];
  avisos: string[];
}

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const caminhoPdi = (pessoa: string) => `pessoas/${pastaPessoa(pessoa)}/pdi.md`;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function normalizarStatus(s: string): StatusAcao {
  const achado = STATUS_ACAO.find((x) => sem(x) === sem(s));
  if (!achado) throw new Error(`Status inválido "${s}". Use: ${STATUS_ACAO.join(', ')}`);
  return achado;
}

export function adicionarMeses(data: string, meses: number): string {
  const [a, m, d] = data.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

const LINHA_ACAO = /^-\s+(?:\[(A\d+)\]\s+)?\*\*(.+?)\*\*(.*)$/;

export function lerAcao(linha: string, posicao: number): AcaoPdi | undefined {
  const m = LINHA_ACAO.exec(linha.trim());
  if (!m) return undefined;
  const campos: Record<string, string> = {};
  for (const parte of m[3].split(/\s+—\s+/).map((x) => x.trim()).filter(Boolean)) {
    const kv = /^(competência|competencia|prazo|status):\s*(.*)$/i.exec(parte);
    if (kv) campos[sem(kv[1])] = kv[2].trim();
  }
  let status: StatusAcao = 'aberta';
  try { if (campos.status) status = normalizarStatus(campos.status); } catch { /* keep aberta; pdi_ler warns */ }
  return { id: m[1] ?? `A${posicao}`, descricao: m[2].trim(), competencia: campos.competencia || undefined, prazo: campos.prazo || undefined, status };
}

export function escreverAcao(a: AcaoPdi): string {
  return `- [${a.id}] **${a.descricao}**${a.competencia ? ` — competência: ${a.competencia}` : ''}${a.prazo ? ` — prazo: ${a.prazo}` : ''} — status: ${a.status}`;
}

function secao(corpo: string, titulo: string): string {
  const m = new RegExp(`^##\\s+${titulo}\\s*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'm').exec(corpo);
  return m ? m[1].trim() : '';
}

function acoesDe(corpo: string): AcaoPdi[] {
  const r: AcaoPdi[] = [];
  for (const linha of secao(corpo, 'Ações').split(/\r?\n/)) {
    const a = lerAcao(linha, r.length + 1);
    if (a) r.push(a);
  }
  return r;
}

export function pdiLer(pessoa: string, agora = new Date()): PdiLido {
  const caminho = caminhoPdi(pessoa);
  let conteudo: string;
  try { conteudo = pessoaLer(caminho); } catch { throw new Error(`Esta pessoa ainda não tem PDI (${caminho}). Crie com pdi_atualizar, acao "criar"`); }
  const { campos, corpo } = lerFrontmatter(conteudo);
  const acoes = acoesDe(corpo);
  const avisos: string[] = [];
  const hoje = hojeSp(agora);

  const papel = texto(campos.papel);
  let competencias: string[] | undefined;
  if (papel) {
    try {
      const plano = papelLer(papel);
      competencias = competenciasDoPlano(plano.corpo);
      if (!plano.revisado) avisos.push(`O plano do papel "${papel}" ainda não foi revisado`);
    } catch (e) { avisos.push(`Sem plano de papel para comparar: ${(e as Error).message}`); }
  } else avisos.push('O PDI não tem o campo "papel": não dá para ligar as ações ao plano');

  for (const a of acoes) {
    if (competencias && a.competencia && !competencias.some((c) => sem(c) === sem(a.competencia!))) avisos.push(`${a.id}: a competência "${a.competencia}" não está no plano do papel`);
    if (competencias && !a.competencia) avisos.push(`${a.id}: sem competência do plano do papel`);
    if (a.prazo && !ISO.test(a.prazo)) avisos.push(`${a.id}: prazo "${a.prazo}" não está no formato AAAA-MM-DD`);
    if (ABERTAS.includes(a.status) && a.prazo && ISO.test(a.prazo) && a.prazo < hoje) avisos.push(`${a.id}: prazo vencido em ${a.prazo}`);
  }
  const revisao = texto(campos.proxima_revisao);
  if (revisao && ISO.test(revisao) && revisao < hoje) avisos.push(`Revisão do PDI vencida (prevista para ${revisao})`);
  if (texto(campos.revisado) !== 'true') avisos.push('PDI ainda não revisado pelo Paulo (revisado: false)');
  return { caminho, campos, objetivo: secao(corpo, 'Objetivo'), acoes, avisos };
}

// ---- writing -------------------------------------------------------------------------------------

function setCampo(conteudo: string, chave: string, valor: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(conteudo);
  if (!m) throw new Error('PDI sem frontmatter');
  const linha = new RegExp(`^${chave}:.*$`, 'm');
  const fm = linha.test(m[1]) ? m[1].replace(linha, `${chave}: ${valor}`) : `${m[1]}\n${chave}: ${valor}`;
  return conteudo.replace(m[1], fm);
}

function gravar(pessoa: string, conteudo: string, exclusivo = false): string {
  const caminho = caminhoPdi(pessoa);
  const dir = join(getVaultRoot(), 'pessoas', pastaPessoa(pessoa));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(getVaultRoot(), caminho), setCampo(conteudo, 'revisado', 'false'), { encoding: 'utf8', flag: exclusivo ? 'wx' : 'w' });
  return caminho;
}

export type OperacaoPdi =
  | { acao: 'criar'; objetivo?: string }
  | { acao: 'adicionar'; descricao: string; competencia?: string; prazo?: string; status?: string }
  | { acao: 'atualizar'; id: string; descricao?: string; competencia?: string; prazo?: string; status?: string }
  | { acao: 'revisar' };

function validarPrazo(prazo?: string) {
  if (prazo && !ISO.test(prazo)) throw new Error('O prazo deve estar no formato AAAA-MM-DD');
}

/** Level `sozinho`, restricted area. Returns a short confirmation (path, ids, dates), never the content. */
export function pdiAtualizar(pessoa: string, op: OperacaoPdi, agora = new Date()): string {
  if (!pessoa.trim()) throw new Error('Informe a pessoa');
  const hoje = hojeSp(agora);
  const proxima = adicionarMeses(hoje, REVISAO_MESES);

  if (op.acao === 'criar') {
    let papel = '';
    let nome = pessoa.trim();
    try {
      const perfil = lerFrontmatter(pessoaLer(`pessoas/${pastaPessoa(pessoa)}/perfil.md`)).campos;
      papel = texto(perfil.papel) ?? '';
      nome = texto(perfil.pessoa) ?? nome;
    } catch { /* no profile yet: the PDI is created without role and pdi_ler warns */ }
    const conteudo = `---
tipo: pdi
titulo: ${JSON.stringify(`PDI — ${nome}`)}
pessoa: ${JSON.stringify(nome)}
data: ${hoje}
papel: ${JSON.stringify(papel)}
proxima_revisao: ${proxima}
revisado: false
origem: copiloto
restrito: true
---

## Objetivo

${op.objetivo?.trim() || '[a definir com a pessoa]'}

## Ações

## Notas internas (não compartilhar)
`;
    try { return `PDI criado em ${gravar(pessoa, conteudo, true)} (revisão prevista para ${proxima})`; }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Esta pessoa já tem PDI. Use "adicionar" ou "atualizar"'); throw e; }
  }

  const caminho = caminhoPdi(pessoa);
  let conteudo: string;
  try { conteudo = pessoaLer(caminho); } catch { throw new Error(`Esta pessoa ainda não tem PDI. Crie com acao "criar"`); }
  const { corpo } = lerFrontmatter(conteudo);
  const acoes = acoesDe(corpo);

  if (op.acao === 'revisar') {
    conteudo = setCampo(setCampo(conteudo, 'ultima_revisao', hoje), 'proxima_revisao', proxima);
    return `Revisão registrada em ${gravar(pessoa, conteudo)}: próxima em ${proxima}`;
  }

  validarPrazo(op.prazo);
  let msg: string;
  if (op.acao === 'adicionar') {
    if (!op.descricao.trim()) throw new Error('Informe a descrição da ação');
    const prox = acoes.reduce((n, a) => Math.max(n, Number(/\d+/.exec(a.id)?.[0] ?? 0)), 0) + 1;
    const nova: AcaoPdi = { id: `A${prox}`, descricao: op.descricao.trim(), competencia: op.competencia?.trim() || undefined, prazo: op.prazo, status: op.status ? normalizarStatus(op.status) : 'aberta' };
    conteudo = inserirAcao(conteudo, acoes, nova);
    msg = `Ação ${nova.id} adicionada`;
  } else {
    const alvo = acoes.find((a) => a.id.toLowerCase() === op.id.trim().toLowerCase());
    if (!alvo) throw new Error(`Ação "${op.id}" não encontrada. Ids: ${acoes.map((a) => a.id).join(', ') || 'nenhuma'}`);
    const nova: AcaoPdi = {
      ...alvo,
      descricao: op.descricao?.trim() || alvo.descricao,
      competencia: op.competencia?.trim() || alvo.competencia,
      prazo: op.prazo ?? alvo.prazo,
      status: op.status ? normalizarStatus(op.status) : alvo.status,
    };
    conteudo = reescreverAcoes(conteudo, acoes.map((a) => (a === alvo ? nova : a)));
    msg = `Ação ${nova.id} atualizada`;
  }
  return `${msg} em ${gravar(pessoa, conteudo)}`;
}

/** Rewrites the action lines of the "## Ações" section in place, keeping the rest of the note. */
function reescreverAcoes(conteudo: string, acoes: AcaoPdi[]): string {
  const m = /^(##\s+Ações\s*\r?\n)([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(conteudo);
  if (!m) throw new Error('O PDI não tem a seção "## Ações"');
  const outras = m[2].split(/\r?\n/).filter((l) => l.trim() && !LINHA_ACAO.test(l.trim()));
  const bloco = [...outras, ...acoes.map(escreverAcao)].join('\n');
  return conteudo.replace(m[0], `${m[1]}\n${bloco}\n\n`);
}

function inserirAcao(conteudo: string, existentes: AcaoPdi[], nova: AcaoPdi): string {
  return reescreverAcoes(conteudo, [...existentes, nova]);
}

// ---- overdue -------------------------------------------------------------------------------------

export interface AcaoAtrasada extends AcaoPdi { pessoa: string; dias_atraso: number }

export function pdiAtrasados(agora = new Date()): { hoje: string; acoes_vencidas: AcaoAtrasada[]; revisoes_vencidas: PendenciaPdi[]; avisos: string[] } {
  const hoje = hojeSp(agora);
  const base = join(getVaultRoot(), 'pessoas');
  const acoes_vencidas: AcaoAtrasada[] = [];
  const avisos: string[] = [];
  if (existsSync(base)) {
    for (const e of readdirSync(base, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_')) continue;
      let conteudo: string;
      try { conteudo = pessoaLer(`pessoas/${e.name}/pdi.md`); } catch { continue; }
      const { campos, corpo } = lerFrontmatter(conteudo);
      const nome = texto(campos.pessoa) ?? e.name;
      for (const a of acoesDe(corpo)) {
        if (!ABERTAS.includes(a.status) || !a.prazo) continue;
        if (!ISO.test(a.prazo)) { avisos.push(`${e.name}: prazo da ação ${a.id} fora do formato AAAA-MM-DD`); continue; }
        if (a.prazo < hoje) acoes_vencidas.push({ ...a, pessoa: nome, dias_atraso: Math.round((Date.parse(hoje) - Date.parse(a.prazo)) / 86_400_000) });
      }
    }
  }
  acoes_vencidas.sort((a, b) => a.pessoa.localeCompare(b.pessoa, 'pt-BR') || a.id.localeCompare(b.id));
  return { hoje, acoes_vencidas, revisoes_vencidas: umAUmPendentes(agora).pdi_vencidos, avisos };
}

// ---- sharing -------------------------------------------------------------------------------------

/**
 * Sharing a PDI with the person ALWAYS asks Paulo's OK (level `pede_ok`). Nothing is sent: the shareable text
 * (objective and actions, never the internal notes) goes to the approval queue and Paulo copies the approved text.
 */
export function pdiCompartilhar(db: Database, pessoa: string, canal: CanalMensagem): number {
  if (!CANAIS_MENSAGEM.includes(canal)) throw new Error(`Canal inválido. Use: ${CANAIS_MENSAGEM.join(', ')}`);
  const pdi = pdiLer(pessoa);
  if (texto(pdi.campos.revisado) !== 'true') throw new Error('Revise o PDI antes de compartilhar: marque revisado: true depois de conferir o texto');
  if (!pdi.acoes.length) throw new Error('O PDI não tem ações para compartilhar');
  const nome = texto(pdi.campos.pessoa) ?? pessoa.trim();
  const textoFinal = [`PDI — ${nome}`, '', 'Objetivo', pdi.objetivo || '[a definir]', '', 'Ações',
    ...pdi.acoes.map((a) => `• ${a.descricao}${a.competencia ? ` (${a.competencia})` : ''}${a.prazo ? ` — prazo ${a.prazo}` : ''} — ${a.status}`)].join('\n');
  const policy = enforcePolicy(db, {
    tool: 'pdi_compartilhar',
    level: 'pede_ok',
    action: `Compartilhar o PDI com ${nome} (${canal})`,
    params: { pessoa: '[restrito]', canal },
    content: textoFinal,
    destination: `${nome} (${canal})`,
    reason: `PDI revisado pelo Paulo. Fonte: ${pdi.caminho}`,
    origin: 'mcp',
  });
  if (!policy.allowed && policy.queued) return policy.queueId;
  throw new Error('reason' in policy ? policy.reason : 'O PDI não entrou na fila');
}

/**
 * T2.2 — Person profile (RF-19). Restricted area: gathers profile, PDI, latest 1:1s, recent records,
 * board signals and achievements of one person. Returns data and paths, never an opinion.
 * The caller must keep the content out of the audit log (only paths) and out of shared channels.
 */
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Database } from 'sql.js';
import { getVaultRoot, pessoaLer, pessoaListar, slugify, vaultListar, vaultLer } from './vault.js';
import { lerFrontmatter, texto, type ValorFrontmatter } from './frontmatter.js';
import { metricasColaborador } from './boards.js';

const ULTIMOS_1X1 = 3;
const REGISTROS_RECENTES = 10;
const FIXOS = ['perfil.md', 'pdi.md'];

export interface PessoaPerfil {
  pessoa: string;
  caminhos: { perfil?: string; pdi?: string; um_a_um: string[]; registros: string[]; conquistas: string[] };
  perfil?: { campos: Record<string, ValorFrontmatter>; corpo: string };
  pdi?: { campos: Record<string, ValorFrontmatter>; corpo: string };
  ultimos_1x1: { caminho: string; corpo: string }[];
  registros_recentes: { caminho: string; tipo?: string; data?: string; corpo: string }[];
  board: unknown;
  conquistas: { caminho: string; titulo?: string }[];
  avisos: string[];
}

const dir = (pessoa: string) => `pessoas/${slugify(pessoa)}`;
const lerOpcional = (c: string) => { try { return pessoaLer(c); } catch { return undefined; } };

export function pessoaPerfil(db: Database | undefined, pessoa: string, agora = new Date()): PessoaPerfil {
  if (!pessoa.trim()) throw new Error('Informe a pessoa');
  const base = dir(pessoa);
  const todas = pessoaListar(pessoa);
  const avisos: string[] = [];

  const perfilTxt = lerOpcional(`${base}/perfil.md`);
  const pdiTxt = lerOpcional(`${base}/pdi.md`);
  if (!perfilTxt) avisos.push('Sem perfil.md: papel, time e cadência de 1:1 desconhecidos');
  if (!pdiTxt) avisos.push('Sem pdi.md');

  // 1x1/ notes, newest first (names start with the date)
  const raiz = getVaultRoot();
  const pastaUmaUm = join(raiz, base, '1x1');
  const umaUm = existsSync(pastaUmaUm)
    ? readdirSync(pastaUmaUm).filter((f) => f.endsWith('.md')).sort().reverse().map((f) => `${base}/1x1/${f}`)
    : [];

  const registros = todas.filter((c) => !FIXOS.some((f) => c.endsWith(`/${f}`)));
  const recentes = registros.slice(0, REGISTROS_RECENTES).map((caminho) => {
    const { campos, corpo } = lerFrontmatter(pessoaLer(caminho));
    return { caminho, tipo: texto(campos.tipo), data: texto(campos.data), corpo: corpo.trim() };
  });

  const perfil = perfilTxt ? lerFrontmatter(perfilTxt) : undefined;
  const time = perfil ? texto(perfil.campos.time) : undefined;

  let board: unknown = null;
  if (db) {
    try { board = JSON.parse(metricasColaborador(db, { pessoa, time })); }
    catch (e) { avisos.push(`Board indisponível: ${(e as Error).message}`); }
  }

  const conquistas = time ? conquistasDoTime(time) : [];

  return {
    pessoa: pessoa.trim(),
    caminhos: { perfil: perfilTxt ? `${base}/perfil.md` : undefined, pdi: pdiTxt ? `${base}/pdi.md` : undefined, um_a_um: umaUm, registros, conquistas: conquistas.map((c) => c.caminho) },
    perfil,
    pdi: pdiTxt ? lerFrontmatter(pdiTxt) : undefined,
    ultimos_1x1: umaUm.slice(0, ULTIMOS_1X1).map((caminho) => ({ caminho, corpo: lerFrontmatter(pessoaLer(caminho)).corpo.trim() })),
    registros_recentes: recentes,
    board,
    conquistas,
    avisos,
  };
}

/** Reviewed achievements credited to the person's team (credit goes to teams, not individuals). */
function conquistasDoTime(time: string): { caminho: string; titulo?: string }[] {
  let arquivos: string[];
  try { arquivos = vaultListar('conquistas').filter((f) => f.endsWith('.md') && !f.startsWith('_')); } catch { return []; }
  const r: { caminho: string; titulo?: string }[] = [];
  for (const f of arquivos.sort().reverse()) {
    const caminho = `conquistas/${f}`;
    const { campos } = lerFrontmatter(vaultLer(caminho));
    const times = Array.isArray(campos.times) ? campos.times : [];
    if (texto(campos.revisado) === 'true' && times.some((t) => t.toLowerCase() === time.toLowerCase())) r.push({ caminho, titulo: texto(campos.titulo) });
  }
  return r.slice(0, 10);
}

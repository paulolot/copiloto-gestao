/**
 * T2.5 — Overdue 1:1s and PDI reviews (RF-24). Restricted area: returns only names, dates and numbers,
 * never the content of a note. The 1:1 cadence comes from each person's perfil.md (default: monthly),
 * the last 1:1 from the notes in pessoas/<nome>/1x1/ and the PDI review date from pdi.md (`proxima_revisao`).
 */
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Sinal } from '../azure/alertas.js';
import { lerFrontmatter, texto } from './frontmatter.js';
import { getVaultRoot, pessoaLer } from './vault.js';

const FUSO = 'America/Sao_Paulo';
const DIA = 86_400_000;
export const CADENCIA_PADRAO = 'mensal';
const CADENCIAS: Record<string, number> = { semanal: 7, quinzenal: 14, mensal: 30, bimestral: 60, trimestral: 90, semestral: 180 };

/** Pseudo team that holds the 1:1 and PDI signals; the scheduler never announces it in a channel. */
export const TIME_SINAIS_1X1 = '1x1';

export interface PendenciaUmAUm {
  pessoa: string;
  cadencia: string;
  ultimo_1x1: string | null;
  proximo_previsto: string | null;
  /** Days past the expected date; negative or zero means on time; null when there is no 1:1 on record. */
  dias_atraso: number | null;
  situacao: 'em_dia' | 'atrasado' | 'sem_registro';
}

export interface PendenciaPdi {
  pessoa: string;
  proxima_revisao: string;
  dias_atraso: number;
}

export interface RelatorioUmAUm {
  hoje: string;
  um_a_um: PendenciaUmAUm[];
  pdi_vencidos: PendenciaPdi[];
  avisos: string[];
}

/** Today's date in São Paulo, as AAAA-MM-DD. */
export function hojeSp(agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const somar = (d: string, dias: number) => new Date(ms(d) + dias * DIA).toISOString().slice(0, 10);
const diferenca = (a: string, b: string) => Math.round((ms(a) - ms(b)) / DIA);

/** `semanal`, `quinzenal`, `mensal`… or "N dias". */
export function cadenciaEmDias(cadencia: string): number | undefined {
  const c = cadencia.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  if (CADENCIAS[c]) return CADENCIAS[c];
  const m = /^(\d{1,3})\s*dias?$/.exec(c);
  return m ? Number(m[1]) : undefined;
}

export function umAUmPendentes(agora = new Date()): RelatorioUmAUm {
  const raiz = getVaultRoot();
  const base = join(raiz, 'pessoas');
  const hoje = hojeSp(agora);
  const r: RelatorioUmAUm = { hoje, um_a_um: [], pdi_vencidos: [], avisos: [] };
  if (!existsSync(base)) return r;

  let ignoradas = 0;
  const pastas = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'));
  for (const pasta of pastas) {
    const rel = `pessoas/${pasta.name}`;
    const perfilTxt = lerOpcional(`${rel}/perfil.md`);
    const dir1x1 = join(base, pasta.name, '1x1');
    const datas = existsSync(dir1x1)
      ? readdirSync(dir1x1).filter((f) => f.endsWith('.md') && !f.startsWith('_') && !/pauta/i.test(f)).flatMap((f) => /^(\d{4}-\d{2}-\d{2})/.exec(f)?.[1] ?? []).sort()
      : [];
    if (!perfilTxt && !datas.length) { ignoradas++; continue; }

    const perfil = perfilTxt ? lerFrontmatter(perfilTxt).campos : {};
    if (texto(perfil.ativo) === 'false') continue;
    const nome = texto(perfil.pessoa) ?? pasta.name;
    let cadencia = texto(perfil.cadencia_1x1) ?? CADENCIA_PADRAO;
    let dias = cadenciaEmDias(cadencia);
    if (dias === undefined) {
      r.avisos.push(`Cadência "${cadencia}" não reconhecida em ${rel}/perfil.md: usei ${CADENCIA_PADRAO}`);
      cadencia = CADENCIA_PADRAO;
      dias = CADENCIAS[CADENCIA_PADRAO];
    }
    if (!perfilTxt) r.avisos.push(`Sem perfil.md em ${rel}: usei a cadência ${CADENCIA_PADRAO}`);

    const ultimo = datas[datas.length - 1] ?? null;
    if (!ultimo) {
      r.um_a_um.push({ pessoa: nome, cadencia, ultimo_1x1: null, proximo_previsto: null, dias_atraso: null, situacao: 'sem_registro' });
    } else {
      const previsto = somar(ultimo, dias);
      const atraso = diferenca(hoje, previsto);
      r.um_a_um.push({ pessoa: nome, cadencia, ultimo_1x1: ultimo, proximo_previsto: previsto, dias_atraso: atraso, situacao: atraso > 0 ? 'atrasado' : 'em_dia' });
    }

    const revisao = lerOpcional(`${rel}/pdi.md`);
    const proxima = revisao ? texto(lerFrontmatter(revisao).campos.proxima_revisao) : undefined;
    if (proxima && /^\d{4}-\d{2}-\d{2}$/.test(proxima) && proxima < hoje) {
      r.pdi_vencidos.push({ pessoa: nome, proxima_revisao: proxima, dias_atraso: diferenca(hoje, proxima) });
    }
  }
  if (ignoradas) r.avisos.push(`${ignoradas} pasta(s) em pessoas/ sem perfil.md nem 1:1 foram ignoradas`);

  // Alphabetical, never ranked
  const porNome = (a: { pessoa: string }, b: { pessoa: string }) => a.pessoa.localeCompare(b.pessoa, 'pt-BR');
  r.um_a_um.sort(porNome);
  r.pdi_vencidos.sort(porNome);
  return r;
}

function lerOpcional(caminho: string): string | undefined {
  try { return pessoaLer(caminho); } catch { return undefined; }
}

const dataBr = (iso: string) => iso.split('-').reverse().join('/');
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Dated signals `1x1:<pessoa>` and `pdi:<pessoa>` for the Porta-voz and the CTO agenda. They live under the
 * pseudo team "1x1", which the hourly cycle does not announce: names stay out of shared channels.
 */
export function sinaisDeUmAUm(agora = new Date()): Sinal[] {
  const r = umAUmPendentes(agora);
  const out: Sinal[] = [];
  for (const p of r.um_a_um) {
    const dias = CADENCIAS[p.cadencia] ?? cadenciaEmDias(p.cadencia) ?? 30;
    if (p.situacao === 'sem_registro') {
      out.push({ chave: `1x1:${slug(p.pessoa)}`, severidade: 'amarelo', descricao: `Sem 1:1 registrado com ${p.pessoa} (cadência ${p.cadencia})` });
    } else if (p.situacao === 'atrasado') {
      out.push({
        chave: `1x1:${slug(p.pessoa)}`, severidade: p.dias_atraso! > dias ? 'vermelho' : 'amarelo',
        descricao: `1:1 com ${p.pessoa} atrasado há ${p.dias_atraso} dia(s) (cadência ${p.cadencia}, último em ${dataBr(p.ultimo_1x1!)})`,
      });
    }
  }
  for (const p of r.pdi_vencidos) {
    out.push({ chave: `pdi:${slug(p.pessoa)}`, severidade: 'amarelo', descricao: `Revisão do PDI de ${p.pessoa} vencida há ${p.dias_atraso} dia(s) (prevista para ${dataBr(p.proxima_revisao)})` });
  }
  return out;
}

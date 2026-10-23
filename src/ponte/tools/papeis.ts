/**
 * T2.3 — Role plans (RF-20): competencies, expectations per level, growth path and readiness signals.
 * Notes live in papeis/ (open area). `papel_ler` returns the plan and what is missing in it, never an opinion.
 */
import { lerFrontmatter, texto, type ValorFrontmatter } from './frontmatter.js';
import { slugify, vaultListar, vaultLer } from './vault.js';

export const SECOES_PLANO = ['Competências', 'Expectativas por nível', 'Trilha de crescimento', 'Sinais de que a pessoa está pronta'];
const CAMPOS_PLANO = ['tipo', 'papel', 'niveis', 'revisado'];

/** Returns what is wrong with a role plan; empty means valid. */
export function validarPlanoPapel(conteudo: string): string[] {
  const { campos, corpo } = lerFrontmatter(conteudo);
  const erros: string[] = [];
  for (const c of CAMPOS_PLANO) if (campos[c] === undefined || (Array.isArray(campos[c]) && !(campos[c] as string[]).length)) erros.push(`Falta o campo "${c}" no frontmatter`);
  if (texto(campos.tipo) !== 'plano') erros.push('O campo "tipo" deve ser "plano"');
  const titulos = new Set([...corpo.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]));
  for (const s of SECOES_PLANO) if (!titulos.has(s)) erros.push(`Falta a seção "${s}"`);
  const niveis = Array.isArray(campos.niveis) ? campos.niveis : [];
  const subtitulos = new Set([...corpo.matchAll(/^###\s+(.+?)\s*$/gm)].map((m) => m[1]));
  for (const n of niveis) if (!subtitulos.has(n)) erros.push(`Falta a expectativa do nível "${n}"`);
  return erros;
}

export interface PlanoPapel {
  caminho: string;
  papel?: string;
  revisado: boolean;
  campos: Record<string, ValorFrontmatter>;
  corpo: string;
  avisos: string[];
}

function planos(): string[] {
  try { return vaultListar('papeis').filter((f) => f.endsWith('.md') && !f.startsWith('_')); } catch { return []; }
}

export function papelLer(papel: string): PlanoPapel {
  if (!papel.trim()) throw new Error('Informe o papel');
  const alvo = slugify(papel);
  const arquivos = planos();
  const achado = arquivos.find((f) => slugify(f.replace(/\.md$/, '')) === alvo)
    ?? arquivos.find((f) => slugify(texto(lerFrontmatter(vaultLer(`papeis/${f}`)).campos.papel) ?? '') === alvo);
  if (!achado) {
    const nomes = arquivos.map((f) => f.replace(/\.md$/, ''));
    throw new Error(`Plano não encontrado para "${papel}". ${nomes.length ? `Planos disponíveis: ${nomes.join(', ')}` : 'Ainda não há planos em papeis/'}`);
  }
  const caminho = `papeis/${achado}`;
  const conteudo = vaultLer(caminho);
  const { campos, corpo } = lerFrontmatter(conteudo);
  const revisado = texto(campos.revisado) === 'true';
  const avisos = validarPlanoPapel(conteudo);
  if (!revisado) avisos.unshift('Plano ainda não revisado pelo Paulo (revisado: false): use como rascunho e diga isso na resposta');
  return { caminho, papel: texto(campos.papel), revisado, campos, corpo: corpo.trim(), avisos };
}

/** Names of the competencies in a role plan: the bold names of the bullets under "## Competências". */
export function competenciasDoPlano(corpo: string): string[] {
  const m = /^##\s+Competências\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(corpo);
  return m ? [...m[1].matchAll(/^-\s+\*\*(.+?)\*\*/gm)].map((x) => x[1].trim()) : [];
}

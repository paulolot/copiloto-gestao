/**
 * T0.6 — Vault tools
 * vault_listar, vault_ler, vault_buscar, vault_criar_nota
 *
 * Security:
 * - Path traversal blocked: nothing outside VAULT_PATH (symlinks are resolved before checking)
 * - Restricted area (pessoas/): only accessible via a restricted tool, compared case-insensitively
 *   because the vault may live on a case-insensitive filesystem (macOS, Windows)
 * - vault_buscar never returns restricted content
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync, statSync } from 'fs';
import { join, resolve, relative, sep, isAbsolute } from 'path';

const RESTRICTED_DIRS = ['pessoas'];
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_RESULTS = 50;

export function getVaultRoot(): string {
  const p = process.env.VAULT_PATH;
  if (!p) throw new Error('VAULT_PATH não configurado');
  return realpathSync(resolve(p));
}

function isInside(root: string, full: string): boolean {
  const rel = relative(root, full);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function isRestricted(root: string, full: string): boolean {
  const firstDir = relative(root, full).split(sep)[0].toLowerCase();
  return RESTRICTED_DIRS.includes(firstDir);
}

/** Resolves to the deepest existing ancestor's real path, so symlinks cannot escape the vault. */
function realish(full: string): string {
  let cur = full;
  const tail: string[] = [];
  while (!existsSync(cur)) {
    tail.unshift(cur.slice(cur.lastIndexOf(sep) + 1));
    const parent = resolve(cur, '..');
    if (parent === cur) break;
    cur = parent;
  }
  return join(realpathSync(cur), ...tail);
}

/** Garante que o caminho está dentro do vault e não é área restrita */
function safePath(vaultRoot: string, rel: string, allowRestricted = false): string {
  const full = realish(resolve(vaultRoot, rel));
  if (!isInside(vaultRoot, full)) {
    throw new Error('Caminho fora do vault (path traversal bloqueado)');
  }
  if (!allowRestricted && isRestricted(vaultRoot, full)) {
    throw new Error(`Área restrita: use a ferramenta específica para "${relative(vaultRoot, full).split(sep)[0]}"`);
  }
  return full;
}

export function vaultListar(pasta = ''): string[] {
  const root = getVaultRoot();
  const dir = pasta ? safePath(root, pasta) : root;
  if (!existsSync(dir)) throw new Error(`Pasta não encontrada: ${pasta}`);
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.'))
    .map((e) => (e.isDirectory() ? e.name + '/' : e.name));
}

export function vaultLer(caminho: string, allowRestricted = false): string {
  const root = getVaultRoot();
  const full = safePath(root, caminho, allowRestricted);
  if (!existsSync(full) || !statSync(full).isFile()) throw new Error(`Nota não encontrada: ${caminho}`);
  if (statSync(full).size > MAX_FILE_BYTES) throw new Error(`Nota grande demais: ${caminho}`);
  return readFileSync(full, 'utf8');
}

export interface BuscaFiltros {
  pasta?: string;
  /** ISO date (YYYY-MM-DD), compared with the `data` field of the frontmatter */
  dataInicio?: string;
  dataFim?: string;
}

export interface BuscaResultado {
  caminho: string;
  trecho: string;
}

function frontmatterDate(content: string): string | undefined {
  return /^---\r?\n[\s\S]*?^data:\s*["']?(\d{4}-\d{2}-\d{2})/m.exec(content)?.[1];
}

export function vaultBuscar(texto: string, filtros?: BuscaFiltros): BuscaResultado[] {
  const query = texto.trim().toLowerCase();
  if (!query) throw new Error('Texto de busca vazio');
  const root = getVaultRoot();
  const basePath = filtros?.pasta ? safePath(root, filtros.pasta) : root;
  const results: BuscaResultado[] = [];

  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (results.length >= MAX_RESULTS) return;
      if (entry.name.startsWith('.')) continue; // .git, .obsidian
      const full = join(dir, entry.name);
      if (isRestricted(root, full)) continue;

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          if (statSync(full).size > MAX_FILE_BYTES) continue;
          const content = readFileSync(full, 'utf8');
          const lower = content.toLowerCase();
          const idx = lower.indexOf(query);
          if (idx === -1) continue;
          if (filtros?.dataInicio || filtros?.dataFim) {
            const data = frontmatterDate(content);
            if (!data) continue;
            if (filtros.dataInicio && data < filtros.dataInicio) continue;
            if (filtros.dataFim && data > filtros.dataFim) continue;
          }
          const start = Math.max(0, idx - 100);
          const end = Math.min(content.length, idx + 200);
          results.push({
            caminho: relative(root, full).split(sep).join('/'),
            trecho: content.slice(start, end).replace(/\n/g, ' '),
          });
        } catch { /* skip unreadable files */ }
      }
    }
  }

  walk(basePath);
  return results;
}

export interface NovaNota {
  tipo: string;
  titulo: string;
  conteudo: string;
  fontes?: string[];
}

function slugify(titulo: string): string {
  const slug = titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'nota';
}

/** Notes created by the Copiloto always go to inbox/ and never overwrite an existing note. */
export function vaultCriarNota(nota: NovaNota): string {
  const root = getVaultRoot();
  const dir = safePath(root, 'inbox');
  mkdirSync(dir, { recursive: true });

  const data = new Date().toISOString().slice(0, 10);
  const base = `${data}-${slugify(nota.titulo)}`;

  // JSON strings are valid YAML scalars, so quotes and newlines in user text cannot break the frontmatter
  const fontesYaml = nota.fontes?.length
    ? '\n' + nota.fontes.map((f) => `  - ${JSON.stringify(f)}`).join('\n')
    : ' []';
  const content = `---
tipo: ${JSON.stringify(nota.tipo)}
titulo: ${JSON.stringify(nota.titulo)}
data: ${data}
fonte:${fontesYaml}
pessoas: []
times: []
origem: copiloto
revisado: false
---

${nota.conteudo}
`;

  for (let n = 0; ; n++) {
    const full = join(dir, n === 0 ? `${base}.md` : `${base}-${n + 1}.md`);
    try {
      writeFileSync(full, content, { encoding: 'utf8', flag: 'wx' });
      return relative(root, full).split(sep).join('/');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
}

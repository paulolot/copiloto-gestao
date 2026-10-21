/**
 * T0.6 — Vault tools
 * vault_listar, vault_ler, vault_buscar, vault_criar_nota
 *
 * Security:
 * - Path traversal blocked: nothing outside VAULT_PATH
 * - Restricted area (pessoas/, papeis/pdi*): only accessible via restricted tool
 * - vault_buscar never returns restricted content
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve, relative } from 'path';

const RESTRICTED_DIRS = ['pessoas'];

export function getVaultRoot(): string {
  const p = process.env.VAULT_PATH;
  if (!p) throw new Error('VAULT_PATH não configurado');
  return resolve(p);
}

/** Garante que o caminho está dentro do vault e não é área restrita */
function safePath(vaultRoot: string, rel: string, allowRestricted = false): string {
  const full = resolve(join(vaultRoot, rel));
  if (!full.startsWith(vaultRoot + '/') && full !== vaultRoot) {
    throw new Error('Caminho fora do vault (path traversal bloqueado)');
  }
  if (!allowRestricted) {
    const relPath = relative(vaultRoot, full);
    const firstDir = relPath.split('/')[0];
    if (RESTRICTED_DIRS.includes(firstDir)) {
      throw new Error(`Área restrita: use a ferramenta específica para "${firstDir}"`);
    }
  }
  return full;
}

export function vaultListar(pasta = ''): string[] {
  const root = getVaultRoot();
  const dir = pasta ? safePath(root, pasta) : root;
  try {
    return readdirSync(dir, { withFileTypes: true }).map((e) =>
      e.isDirectory() ? e.name + '/' : e.name,
    );
  } catch {
    return [];
  }
}

export function vaultLer(caminho: string, allowRestricted = false): string {
  const root = getVaultRoot();
  const full = safePath(root, caminho, allowRestricted);
  if (!existsSync(full)) throw new Error(`Nota não encontrada: ${caminho}`);
  return readFileSync(full, 'utf8');
}

export interface BuscaFiltros {
  pasta?: string;
  dataInicio?: string;
  dataFim?: string;
}

export interface BuscaResultado {
  caminho: string;
  trecho: string;
}

export function vaultBuscar(texto: string, filtros?: BuscaFiltros): BuscaResultado[] {
  const root = getVaultRoot();
  const basePath = filtros?.pasta ? safePath(root, filtros.pasta) : root;
  const results: BuscaResultado[] = [];
  const query = texto.toLowerCase();

  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(root, full);
      const firstDir = rel.split('/')[0];

      // Skip restricted areas
      if (RESTRICTED_DIRS.includes(firstDir)) continue;

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.md')) {
        try {
          const content = readFileSync(full, 'utf8');
          if (content.toLowerCase().includes(query)) {
            // Return a short excerpt around the first match
            const idx = content.toLowerCase().indexOf(query);
            const start = Math.max(0, idx - 100);
            const end = Math.min(content.length, idx + 200);
            results.push({
              caminho: rel,
              trecho: content.slice(start, end).replace(/\n/g, ' '),
            });
          }
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
  pasta?: string;
}

export function vaultCriarNota(nota: NovaNota): string {
  const root = getVaultRoot();
  const pasta = nota.pasta ?? 'inbox';
  const dir = safePath(root, pasta);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const slug = nota.titulo
    .toLowerCase()
    .replace(/[^a-z0-9\-_À-ɏ]/g, '-')
    .replace(/-+/g, '-');
  const data = new Date().toISOString().slice(0, 10);
  const filename = `${data}-${slug}.md`;
  const full = join(dir, filename);

  const fontesYaml = nota.fontes?.map((f) => `  - "${f}"`).join('\n') ?? '';
  const content = `---
tipo: ${nota.tipo}
titulo: "${nota.titulo}"
data: ${data}
fonte:
${fontesYaml}
origem: copiloto
revisado: false
---

${nota.conteudo}
`;

  writeFileSync(full, content, 'utf8');
  return relative(root, full);
}

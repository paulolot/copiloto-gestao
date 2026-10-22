/**
 * T0.9 — Importador de colaboradores (lógica)
 * Copia preservando a estrutura, sem alterar o original.
 * Adiciona frontmatter sem sobrescrever (nem reescrever) o existente.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve, relative, dirname, sep, isAbsolute } from 'path';

export interface ImportOptions {
  origem: string;
  destino: string;
  simular: boolean;
  log?: (msg: string) => void;
}

export interface ImportReport {
  copiados: string[];
  ignorados: string[];
  conflitos: string[];
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function inferTipo(relativePath: string): string {
  const firstDir = relativePath.split(/[\\/]/)[0].toLowerCase();
  const map: Record<string, string> = {
    pessoas: 'pessoa',
    times: 'time',
    reunioes: 'reuniao',
    decisoes: 'decisao',
    produtos: 'produto',
    papeis: 'plano',
  };
  return map[firstDir] ?? 'pessoa'; // everything imported lands in pessoas/
}

/**
 * Keeps the existing frontmatter text as is and only appends the keys that are missing.
 * Line endings are normalised to LF (a vault written on Windows has CRLF), so the result never mixes the two.
 */
export function addFrontmatter(rawContent: string, rel: string, hoje = new Date().toISOString().slice(0, 10)): string {
  const content = rawContent.replace(/\r\n?/g, '\n');
  const m = FRONTMATTER.exec(content);
  const existing = m ? m[1] : '';
  const body = m ? content.slice(m[0].length) : content;
  const has = (key: string) => new RegExp(`^${key}\\s*:`, 'm').test(existing);

  const defaults: [string, string][] = [
    ['tipo', inferTipo(rel)],
    ['data', hoje],
    ['origem', 'importado'],
    ['importado_em', hoje],
    ['revisado', 'false'],
  ];
  const added = defaults.filter(([k]) => !has(k)).map(([k, v]) => `${k}: ${v}`);
  const yaml = [existing, ...added].filter((l) => l !== '').join('\n');
  return `---\n${yaml}\n---\n${m ? '' : '\n'}${body}`;
}

function walkDir(dir: string, base: string, report: ImportReport): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.name.startsWith('.')) {
      report.ignorados.push(relative(base, full)); // .git, .obsidian
    } else if (entry.isDirectory()) {
      results.push(...walkDir(full, base, report));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      results.push(full);
    } else {
      report.ignorados.push(relative(base, full));
    }
  }
  return results;
}

export function importar(opts: ImportOptions): ImportReport {
  const log = opts.log ?? (() => {});
  const origem = resolve(opts.origem);
  const destino = resolve(opts.destino);
  const report: ImportReport = { copiados: [], ignorados: [], conflitos: [] };

  if (!existsSync(origem)) throw new Error(`Pasta de origem não encontrada: ${origem}`);
  const destRel = relative(origem, destino);
  if (destRel === '' || (!destRel.startsWith('..') && !isAbsolute(destRel))) {
    throw new Error('O destino não pode estar dentro da pasta de origem');
  }

  for (const srcFull of walkDir(origem, origem, report)) {
    const rel = relative(origem, srcFull);
    const destFull = join(destino, 'pessoas', rel); // Collaborators go into pessoas/
    const shown = rel.split(sep).join('/');

    if (existsSync(destFull)) {
      report.conflitos.push(rel);
      log(`  ⚠️  Conflito: ${shown} (já existe no destino — pulado)`);
      continue;
    }

    if (opts.simular) {
      log(`  🔍 [simular] Copiaria: ${shown} → pessoas/${shown}`);
    } else {
      mkdirSync(dirname(destFull), { recursive: true });
      writeFileSync(destFull, addFrontmatter(readFileSync(srcFull, 'utf8'), rel), { encoding: 'utf8', flag: 'wx' });
      log(`  ✅ Copiado: ${shown} → pessoas/${shown}`);
    }
    report.copiados.push(rel);
  }

  return report;
}

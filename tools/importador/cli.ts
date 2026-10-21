#!/usr/bin/env tsx
/**
 * T0.9 — Importador de colaboradores
 * CLI: tsx tools/importador/cli.ts --origem <pasta> --destino <vault> [--simular]
 *
 * Copia preservando a estrutura, sem alterar o original.
 * Adiciona frontmatter sem sobrescrever o existente.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join, resolve, relative, extname, basename } from 'path';

interface ImportOptions {
  origem: string;
  destino: string;
  simular: boolean;
}

interface ImportReport {
  copiados: string[];
  ignorados: string[];
  conflitos: string[];
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  if (!content.startsWith('---')) return { frontmatter: {}, body: content };
  const end = content.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: {}, body: content };
  const yaml = content.slice(4, end);
  const body = content.slice(end + 4).trimStart();
  const frontmatter: Record<string, string> = {};
  for (const line of yaml.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    frontmatter[key] = val;
  }
  return { frontmatter, body };
}

function inferTipo(relativePath: string): string {
  const firstDir = relativePath.split('/')[0].toLowerCase();
  const map: Record<string, string> = {
    pessoas: 'pessoa',
    times: 'time',
    reunioes: 'reuniao',
    decisoes: 'decisao',
    produtos: 'produto',
    papeis: 'plano',
  };
  return map[firstDir] ?? 'nota';
}

function addFrontmatter(content: string, rel: string): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const hoje = new Date().toISOString().slice(0, 10);

  // Don't overwrite existing frontmatter fields
  const updated = {
    ...frontmatter,
    tipo: frontmatter.tipo ?? inferTipo(rel),
    data: frontmatter.data ?? hoje,
    origem: frontmatter.origem ?? 'importado',
    importado_em: frontmatter.importado_em ?? hoje,
    revisado: frontmatter.revisado ?? 'false',
  };

  const yamlLines = Object.entries(updated)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  return `---\n${yamlLines}\n---\n\n${body}`;
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else if (extname(entry.name) === '.md') {
      results.push(full);
    }
  }
  return results;
}

function importar(opts: ImportOptions): ImportReport {
  const origem = resolve(opts.origem);
  const destino = resolve(opts.destino);
  const report: ImportReport = { copiados: [], ignorados: [], conflitos: [] };

  if (!existsSync(origem)) {
    throw new Error(`Pasta de origem não encontrada: ${origem}`);
  }

  const files = walkDir(origem);

  for (const srcFull of files) {
    const rel = relative(origem, srcFull);
    const destFull = join(destino, 'pessoas', rel); // Collaborators go into pessoas/

    if (existsSync(destFull)) {
      report.conflitos.push(rel);
      console.log(`  ⚠️  Conflito: ${rel} (já existe no destino — pulado)`);
      continue;
    }

    const content = readFileSync(srcFull, 'utf8');
    const withFrontmatter = addFrontmatter(content, rel);

    if (opts.simular) {
      console.log(`  🔍 [simular] Copiaria: ${rel} → pessoas/${rel}`);
      report.copiados.push(rel);
    } else {
      const destDir = join(destFull, '..');
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
      writeFileSync(destFull, withFrontmatter, 'utf8');
      console.log(`  ✅ Copiado: ${rel} → pessoas/${rel}`);
      report.copiados.push(rel);
    }
  }

  return report;
}

// ── CLI parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let origem = '';
let destino = '';
let simular = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--origem' && args[i + 1]) origem = args[++i];
  else if (args[i] === '--destino' && args[i + 1]) destino = args[++i];
  else if (args[i] === '--simular') simular = true;
}

if (!origem || !destino) {
  console.error('Uso: tsx tools/importador/cli.ts --origem <pasta> --destino <vault> [--simular]');
  process.exit(1);
}

console.log(`\nImportador de colaboradores${simular ? ' (modo simular — nada será gravado)' : ''}`);
console.log(`Origem:  ${origem}`);
console.log(`Destino: ${destino}/pessoas/\n`);

try {
  const report = importar({ origem, destino, simular });
  console.log(`\n─── Relatório ───────────────────────────────`);
  console.log(`Copiados:  ${report.copiados.length}`);
  console.log(`Ignorados: ${report.ignorados.length}`);
  console.log(`Conflitos: ${report.conflitos.length}`);
  if (report.conflitos.length > 0) {
    console.log(`\nConflitos (já existiam no destino):`);
    report.conflitos.forEach((f) => console.log(`  - ${f}`));
  }
} catch (e) {
  console.error(`Erro: ${(e as Error).message}`);
  process.exit(1);
}

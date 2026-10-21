#!/usr/bin/env tsx
/**
 * T0.9 — Importador de colaboradores
 * CLI: tsx tools/importador/cli.ts --origem <pasta> --destino <vault> [--simular]
 */
import { importar } from './importar.js';

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
  const report = importar({ origem, destino, simular, log: console.log });
  console.log(`\n─── Relatório ───────────────────────────────`);
  console.log(`Copiados:  ${report.copiados.length}`);
  console.log(`Ignorados: ${report.ignorados.length}`);
  console.log(`Conflitos: ${report.conflitos.length}`);
  if (report.ignorados.length > 0) {
    console.log(`\nIgnorados (não são notas .md ou são ocultos):`);
    report.ignorados.forEach((f) => console.log(`  - ${f}`));
  }
  if (report.conflitos.length > 0) {
    console.log(`\nConflitos (já existiam no destino):`);
    report.conflitos.forEach((f) => console.log(`  - ${f}`));
  }
} catch (e) {
  console.error(`Erro: ${(e as Error).message}`);
  process.exit(1);
}

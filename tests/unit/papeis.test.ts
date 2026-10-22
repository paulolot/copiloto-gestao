/**
 * T2.3 — role plan model, validator and papel_ler
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { papelLer, validarPlanoPapel } from '../../src/ponte/tools/papeis.js';

const modelo = readFileSync(join(process.cwd(), 'vault-template/papeis/_modelo.md'), 'utf8');
let raiz: string;

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'vault-papeis-'));
  mkdirSync(join(raiz, 'papeis'));
  process.env.VAULT_PATH = raiz;
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

describe('validarPlanoPapel', () => {
  it('accepts the template', () => expect(validarPlanoPapel(modelo)).toEqual([]));

  it('reports missing fields, sections and level expectations', () => {
    const quebrado = modelo.replace('papel: "Nome do Papel"\n', '').replace('## Trilha de crescimento', '## Outra coisa').replace('### Sênior', '### Staff');
    expect(validarPlanoPapel(quebrado)).toEqual([
      'Falta o campo "papel" no frontmatter',
      'Falta a seção "Trilha de crescimento"',
      'Falta a expectativa do nível "Sênior"',
    ]);
  });

  it('rejects another note type', () => {
    expect(validarPlanoPapel(modelo.replace('tipo: plano', 'tipo: reuniao'))).toContain('O campo "tipo" deve ser "plano"');
  });
});

describe('papelLer', () => {
  const grava = (arq: string, revisado: boolean, papel = 'Tech Lead') =>
    writeFileSync(join(raiz, 'papeis', arq), modelo.replace('Nome do Papel', papel).replace('revisado: false', `revisado: ${revisado}`).replace('Nome do Papel', papel));

  it('finds the plan by file name or by the papel field, ignoring case and accents', () => {
    grava('tech-lead.md', true);
    grava('sm.md', true, 'Scrum Master');
    expect(papelLer('Tech Lead').caminho).toBe('papeis/tech-lead.md');
    expect(papelLer('scrum master').caminho).toBe('papeis/sm.md');
  });

  it('returns the content with no warnings when reviewed and complete', () => {
    grava('tech-lead.md', true);
    const p = papelLer('tech lead');
    expect(p.revisado).toBe(true);
    expect(p.avisos).toEqual([]);
    expect(p.corpo).toContain('## Competências');
  });

  it('warns that an unreviewed plan is a draft', () => {
    grava('tech-lead.md', false);
    expect(papelLer('tech lead').avisos[0]).toContain('não revisado');
  });

  it('lists the available plans when the role is unknown, ignoring templates', () => {
    grava('tech-lead.md', true);
    writeFileSync(join(raiz, 'papeis', '_modelo.md'), modelo);
    expect(() => papelLer('gerente')).toThrow('Planos disponíveis: tech-lead');
  });
});

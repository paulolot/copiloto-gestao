/**
 * T0.6 — Vault tools tests
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { rmSync, readdirSync, symlinkSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { vaultListar, vaultLer, vaultBuscar, vaultCriarNota } from '../../src/ponte/tools/vault.js';

const FIXTURE_ROOT = join(process.cwd(), 'tests/fixtures/vault');

beforeAll(() => {
  process.env.VAULT_PATH = FIXTURE_ROOT;
});

afterAll(() => {
  // Clean up created test notes in inbox
  for (const f of readdirSync(join(FIXTURE_ROOT, 'inbox'))) {
    if (f.includes('nota-de-teste') || f.includes('titulo-com-aspas')) rmSync(join(FIXTURE_ROOT, 'inbox', f));
  }
  rmSync(join(FIXTURE_ROOT, 'link-fora'), { force: true });
});

describe('vault_listar', () => {
  it('lists root folders', () => {
    const items = vaultListar();
    expect(items).toContain('reunioes/');
    expect(items).toContain('pessoas/');
  });

  it('lists files in reunioes/', () => {
    const items = vaultListar('reunioes');
    expect(items.some((i) => i.includes('reuniao-squad'))).toBe(true);
  });
});

describe('vault_ler', () => {
  it('reads an existing note', () => {
    const content = vaultLer('reunioes/2026-10-01-reuniao-squad.md');
    expect(content).toContain('Squad Fiscal');
  });

  it('throws for non-existent note', () => {
    expect(() => vaultLer('reunioes/nao-existe.md')).toThrow('Nota não encontrada');
  });

  it('blocks restricted area', () => {
    expect(() => vaultLer('pessoas/joao-silva.md')).toThrow('Área restrita');
  });

  it('allows restricted area with flag', () => {
    const content = vaultLer('pessoas/joao-silva.md', true);
    expect(content).toContain('João Silva');
  });
});

describe('vault_buscar', () => {
  it('finds notes by keyword', () => {
    const results = vaultBuscar('Squad Fiscal');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].caminho).toContain('reunioes/');
  });

  it('never returns restricted content', () => {
    const results = vaultBuscar('João Silva');
    expect(results.every((r) => !r.caminho.startsWith('pessoas/'))).toBe(true);
  });

  it('returns empty for unknown term', () => {
    const results = vaultBuscar('xyzxyzxyz_inexistente');
    expect(results).toHaveLength(0);
  });
});

describe('vault_criar_nota', () => {
  it('creates a note in inbox with revisado: false', () => {
    const path = vaultCriarNota({
      tipo: 'decisao',
      titulo: 'Nota de Teste',
      conteudo: 'Conteúdo da nota de teste',
      fontes: ['https://exemplo.com'],
    });
    expect(path).toContain('inbox/');
    expect(path).toContain('nota-de-teste');
    const content = vaultLer(path);
    expect(content).toContain('revisado: false');
    expect(content).toContain('origem: copiloto');
    expect(content).toContain('Conteúdo da nota de teste');
  });
});

describe('path traversal protection', () => {
  it('blocks traversal with ../', () => {
    expect(() => vaultLer('../../../etc/passwd')).toThrow('fora do vault');
  });
});

describe('hardening', () => {
  it('blocks restricted area regardless of case or ./ prefix', () => {
    expect(() => vaultLer('Pessoas/joao-silva.md')).toThrow('Área restrita');
    expect(() => vaultLer('./pessoas/joao-silva.md')).toThrow('Área restrita');
    expect(() => vaultLer('reunioes/../pessoas/joao-silva.md')).toThrow('Área restrita');
    expect(() => vaultListar('pessoas')).toThrow('Área restrita');
  });

  it('blocks a symlink that points outside the vault', () => {
    const outside = mkdtempSync(join(tmpdir(), 'fora-'));
    symlinkSync(outside, join(FIXTURE_ROOT, 'link-fora'));
    expect(() => vaultListar('link-fora')).toThrow('fora do vault');
    expect(() => vaultBuscar('x', { pasta: 'link-fora' })).toThrow('fora do vault');
    rmSync(join(FIXTURE_ROOT, 'link-fora'));
    rmSync(outside, { recursive: true });
  });

  it('throws for a missing folder instead of pretending it is empty', () => {
    expect(() => vaultListar('nao-existe')).toThrow('Pasta não encontrada');
  });

  it('rejects an empty search', () => {
    expect(() => vaultBuscar('  ')).toThrow('vazio');
  });

  it('filters search by frontmatter date', () => {
    expect(vaultBuscar('Squad Fiscal', { dataInicio: '2026-10-01', dataFim: '2026-10-31' })).toHaveLength(1);
    expect(vaultBuscar('Squad Fiscal', { dataInicio: '2026-11-01' })).toHaveLength(0);
  });

  it('keeps the frontmatter valid when the title has quotes and newlines', () => {
    const path = vaultCriarNota({ tipo: 'decisao', titulo: 'Titulo com "aspas"\ntipo: hack', conteudo: 'x' });
    const content = vaultLer(path);
    const fm = content.split('---')[1];
    expect(fm.match(/^tipo:/gm)).toHaveLength(1);
    expect(fm).toContain('titulo: "Titulo com \\"aspas\\"\\ntipo: hack"');
  });

  it('never overwrites an existing note', () => {
    const a = vaultCriarNota({ tipo: 'decisao', titulo: 'Nota de Teste', conteudo: 'um' });
    const b = vaultCriarNota({ tipo: 'decisao', titulo: 'Nota de Teste', conteudo: 'dois' });
    expect(a).not.toBe(b);
    expect(vaultLer(a)).toContain('um');
  });
});

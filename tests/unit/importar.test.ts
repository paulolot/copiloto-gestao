/**
 * T0.9 — Importer tests
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, sep } from 'path';
import { importar, addFrontmatter } from '../../tools/importador/importar.js';

const ORIGEM = join(process.cwd(), 'tests/fixtures/colaboradores');
let destino: string;

beforeEach(() => { destino = mkdtempSync(join(tmpdir(), 'vault-')); });
afterEach(() => rmSync(destino, { recursive: true, force: true }));

describe('importador', () => {
  it('copies notes into pessoas/ keeping the structure and reports ignored files', () => {
    const r = importar({ origem: ORIGEM, destino, simular: false });
    expect(r.copiados.sort()).toEqual(['ana/1x1.md', 'ana/perfil.md'].map((p) => p.replace('/', sep)));
    expect(r.ignorados.some((f) => f.endsWith('foto.png'))).toBe(true);
    expect(r.ignorados).toContain('.obsidian');
    expect(existsSync(join(destino, 'pessoas/ana/perfil.md'))).toBe(true);
    expect(existsSync(join(destino, 'pessoas/ana/foto.png'))).toBe(false);
  });

  it('keeps existing frontmatter (including lists) and only adds missing keys', () => {
    importar({ origem: ORIGEM, destino, simular: false });
    const out = readFileSync(join(destino, 'pessoas/ana/perfil.md'), 'utf8');
    expect(out).toContain('pessoas:\n  - Ana');
    expect(out).toContain('tags: [dev, fiscal]');
    expect(out.match(/^tipo:/gm)).toHaveLength(1);
    expect(out).toContain('origem: importado');
    expect(out).toContain('revisado: false');
    expect(out).toContain('Perfil da Ana.');
  });

  it('handles a vault written on Windows (CRLF): same result, LF only, nothing mixed', () => {
    const lf = addFrontmatter('---\npessoas:\n  - Ana\ntags: [dev]\n---\nCorpo.\n', 'ana/perfil.md', '2026-10-22');
    const crlf = addFrontmatter('---\r\npessoas:\r\n  - Ana\r\ntags: [dev]\r\n---\r\nCorpo.\r\n', 'ana/perfil.md', '2026-10-22');
    expect(crlf).toBe(lf);
    expect(crlf).not.toContain('\r');
    expect(addFrontmatter('Sem frontmatter\r\nlinha 2\r\n', 'ana/x.md', '2026-10-22')).not.toContain('\r');
  });

  it('simulate writes nothing', () => {
    const r = importar({ origem: ORIGEM, destino, simular: true });
    expect(r.copiados).toHaveLength(2);
    expect(existsSync(join(destino, 'pessoas'))).toBe(false);
  });

  it('reports conflicts and does not overwrite', () => {
    mkdirSync(join(destino, 'pessoas/ana'), { recursive: true });
    writeFileSync(join(destino, 'pessoas/ana/perfil.md'), 'original');
    const r = importar({ origem: ORIGEM, destino, simular: false });
    expect(r.conflitos).toHaveLength(1);
    expect(readFileSync(join(destino, 'pessoas/ana/perfil.md'), 'utf8')).toBe('original');
  });

  it('refuses a destination inside the origin', () => {
    expect(() => importar({ origem: ORIGEM, destino: join(ORIGEM, 'vault'), simular: true })).toThrow('dentro da pasta de origem');
  });

  it('adds frontmatter to a note without one', () => {
    const out = addFrontmatter('Texto', 'ana/x.md', '2026-10-21');
    expect(out.startsWith('---\ntipo: pessoa\ndata: 2026-10-21')).toBe(true);
    expect(out.endsWith('---\n\nTexto')).toBe(true);
  });
});

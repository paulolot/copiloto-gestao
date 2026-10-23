/**
 * pastaPessoa: first name, short name and full name reach the same folder; never a guess between two people
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pastaPessoa, pessoaListar, pessoaRegistrar } from '../../src/ponte/tools/vault.js';
import { pdiAtualizar, pdiLer } from '../../src/ponte/tools/pdi.js';
import { pessoaPerfil } from '../../src/ponte/tools/pessoa-perfil.js';

let raiz: string;
const nota = (rel: string, txt = '---\ntipo: x\n---\n') => { const f = join(raiz, rel); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, txt); };

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'vault-pasta-'));
  process.env.VAULT_PATH = raiz;
  nota('pessoas/luiz-fernando/perfil.md', '---\ntipo: perfil\npessoa: "Luiz Fernando Rodrigues Pereira"\npapel: "Tech Lead"\n---\n');
  nota('pessoas/ricardo-santos/perfil.md', '---\ntipo: perfil\npessoa: "Ricardo Santos"\n---\n');
  nota('pessoas/ricardo-silva/perfil.md', '---\ntipo: perfil\npessoa: "Ricardo Silva"\n---\n');
  nota('pessoas/_contexto/fabio-vendramin.md');
  nota('pessoas/fabio-nobre/perfil.md', '---\ntipo: perfil\npessoa: "Fábio Nobre"\n---\n');
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

describe('pastaPessoa', () => {
  it('maps first name, short name and full name to the same folder', () => {
    for (const n of ['Luiz', 'luiz fernando', 'Luiz Fernando Rodrigues Pereira']) expect(pastaPessoa(n)).toBe('luiz-fernando');
    expect(pastaPessoa('Fábio')).toBe('fabio-nobre'); // the _contexto folder is not a candidate
  });
  it('refuses to guess between two people', () => {
    expect(() => pastaPessoa('Ricardo')).toThrow('mais de uma pessoa (ricardo-santos, ricardo-silva)');
    expect(pastaPessoa('Ricardo Santos')).toBe('ricardo-santos');
  });
  it('keeps the plain slug for a new person', () => expect(pastaPessoa('Ana Paula')).toBe('ana-paula'));
  it('does not match on a partial word', () => expect(pastaPessoa('Lui')).toBe('lui'));
});

describe('tools use it', () => {
  it('pessoa_registrar writes into the existing folder and pessoa_listar finds it', () => {
    const c = pessoaRegistrar({ pessoa: 'Luiz', tipo: 'conversa', texto: 'x' });
    expect(c).toMatch(/^pessoas\/luiz-fernando\//);
    expect(pessoaListar('Luiz Fernando Rodrigues Pereira')).toContain(c);
  });
  it('pessoa_perfil and the PDI tools accept any form of the name', () => {
    expect(pessoaPerfil(undefined, 'Luiz').caminhos.perfil).toBe('pessoas/luiz-fernando/perfil.md');
    pdiAtualizar('Luiz Fernando Rodrigues Pereira', { acao: 'criar' });
    expect(pdiLer('Luiz').caminho).toBe('pessoas/luiz-fernando/pdi.md');
  });
});

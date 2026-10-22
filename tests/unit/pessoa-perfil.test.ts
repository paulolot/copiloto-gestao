/**
 * T2.2 — pessoa_perfil: aggregation in the restricted area, board signals optional, nothing in the audit log
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { cpSync, mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from 'sql.js';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../../src/ponte/app.js';
import { queryAudit } from '../../src/ponte/db/audit.js';
import { pessoaPerfil } from '../../src/ponte/tools/pessoa-perfil.js';
import { lerFrontmatter } from '../../src/ponte/tools/frontmatter.js';
import { makeTestDb } from './helpers.js';

const TOKEN = 't';
const tmp = mkdtempSync(join(tmpdir(), 'vault-'));
let db: Database;
let server: Server;
let client: Client;

beforeAll(async () => {
  cpSync(join(process.cwd(), 'tests/fixtures/vault'), tmp, { recursive: true });
  process.env.VAULT_PATH = tmp;
  db = await makeTestDb();
  server = createApp(db, TOKEN);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  client = new Client({ name: 'teste', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  }));
});
afterAll(async () => {
  await client.close();
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(tmp, { recursive: true, force: true });
});

describe('lerFrontmatter', () => {
  it('reads scalars, quoted strings, inline and bullet lists', () => {
    const { campos, corpo } = lerFrontmatter('---\ntipo: "a: b"\ntimes: ["X", "Y"]\nobjetivos:\n  - "um"\n  - dois\nvazio: []\n---\ncorpo\n');
    expect(campos).toEqual({ tipo: 'a: b', times: ['X', 'Y'], objetivos: ['um', 'dois'], vazio: [] });
    expect(corpo).toBe('corpo\n');
  });
});

describe('pessoaPerfil', () => {
  it('gathers profile, PDI, latest 1:1s newest first, records and team achievements', () => {
    const p = pessoaPerfil(undefined, 'Ana Souza');
    expect(p.perfil?.campos).toMatchObject({ papel: 'Tech Lead', time: 'Squad Alfa', cadencia_1x1: 'mensal' });
    expect(p.caminhos.perfil).toBe('pessoas/ana-souza/perfil.md');
    expect(p.caminhos.pdi).toBe('pessoas/ana-souza/pdi.md');
    expect(p.caminhos.um_a_um).toEqual(['pessoas/ana-souza/1x1/2026-09-24-1x1.md', 'pessoas/ana-souza/1x1/2026-08-20-1x1.md']);
    expect(p.ultimos_1x1[0].corpo).toContain('setembro');
    expect(p.caminhos.registros).toEqual(['pessoas/ana-souza/2026-10-05-feedback.md']);
    expect(p.registros_recentes[0]).toMatchObject({ tipo: 'feedback', data: '2026-10-05', corpo: 'Boa condução da release.' });
    expect(p.conquistas).toEqual([{ caminho: 'conquistas/2026-10-10-release-fiscal.md', titulo: 'Release fiscal sem bug externo' }]);
  });

  it('warns about missing profile and PDI instead of failing', () => {
    const p = pessoaPerfil(undefined, 'Pessoa Sem Pasta');
    expect(p.avisos).toEqual(['Sem perfil.md: papel, time e cadência de 1:1 desconhecidos', 'Sem pdi.md']);
    expect(p.caminhos.um_a_um).toEqual([]);
  });

  it('reports the board as unavailable when there is no synced data', () => {
    const p = pessoaPerfil(db, 'Ana Souza');
    expect(p.board).toBeNull();
    expect(p.avisos.join(' ')).toContain('Board indisponível');
  });

  it('through MCP: returns the data but the audit log keeps neither name nor content', async () => {
    const r = await client.callTool({ name: 'pessoa_perfil', arguments: { pessoa: 'Ana Souza' } });
    const txt = (r.content as { text: string }[])[0].text;
    expect(JSON.parse(txt).perfil.campos.papel).toBe('Tech Lead');
    const log = JSON.stringify(queryAudit(db, 5));
    expect(log).toContain('[restrito]');
    expect(log).not.toContain('Ana');
    expect(log).not.toContain('Boa condução');
  });
});

describe('pessoas/ models', () => {
  const dir = join(process.cwd(), 'vault-template/pessoas');
  const obrigatorios: Record<string, string[]> = {
    '_modelo-perfil.md': ['tipo', 'pessoa', 'papel', 'time', 'cadencia_1x1', 'objetivos', 'revisado', 'restrito'],
    '_modelo-pdi.md': ['tipo', 'pessoa', 'papel', 'proxima_revisao', 'revisado', 'restrito'],
    '1x1/_modelo-1x1.md': ['tipo', 'pessoa', 'data', 'revisado', 'restrito'],
  };
  it.each(Object.entries(obrigatorios))('%s has the required fields and starts unreviewed', (arq, campos) => {
    const { campos: fm } = lerFrontmatter(readFileSync(join(dir, arq), 'utf8'));
    for (const c of campos) expect(fm).toHaveProperty(c);
    expect(fm.revisado).toBe('false');
    expect(fm.restrito).toBe('true');
  });
  it('keeps the dated example files out of the template folder', () => {
    expect(readdirSync(dir).filter((n) => statSync(join(dir, n)).isFile()).sort()).toEqual(['_modelo-pdi.md', '_modelo-perfil.md']);
  });
});

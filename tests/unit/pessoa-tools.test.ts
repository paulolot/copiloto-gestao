/**
 * Restricted-area tools about people, through a real MCP client
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { cpSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from 'sql.js';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../../src/ponte/app.js';
import { queryAudit } from '../../src/ponte/db/audit.js';
import { pessoaLer, pessoaListar, pessoaRegistrar } from '../../src/ponte/tools/vault.js';
import { makeTestDb } from './helpers.js';

const TOKEN = 't';
const tmp = mkdtempSync(join(tmpdir(), 'vault-'));
let db: Database;
let server: Server;
let client: Client;
const call = async (name: string, args: Record<string, unknown>) => {
  const r = await client.callTool({ name, arguments: args });
  return { text: (r.content as { text: string }[])[0].text, isError: !!r.isError };
};

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

describe('pessoaRegistrar', () => {
  it('never overwrites and numbers the second note of the day', () => {
    const a = pessoaRegistrar({ pessoa: 'Carlos Lima', tipo: 'conversa', texto: 'primeira' });
    const b = pessoaRegistrar({ pessoa: 'Carlos Lima', tipo: 'conversa', texto: 'segunda' });
    expect(b).toBe(a.replace('.md', '-2.md'));
    expect(pessoaListar('Carlos Lima')).toEqual([b, a]);
  });

  it('keeps a hostile name inside pessoas/ and rejects bad input', () => {
    const c = pessoaRegistrar({ pessoa: '../../inbox/x', tipo: 'impressao', texto: 'teste' });
    expect(c.startsWith('pessoas/inbox-x/')).toBe(true);
    expect(() => pessoaRegistrar({ pessoa: ' ', tipo: 'impressao', texto: 'x' })).toThrow('pessoa');
    expect(() => pessoaRegistrar({ pessoa: 'Ana', tipo: 'impressao', texto: ' ' })).toThrow('texto');
    expect(() => pessoaRegistrar({ pessoa: 'Ana', tipo: 'fofoca' as never, texto: 'x' })).toThrow('Tipo inválido');
  });

  it('pessoaLer reads only the restricted area', () => {
    const c = pessoaRegistrar({ pessoa: 'Dora', tipo: 'feedback', texto: 'conteúdo restrito' });
    expect(pessoaLer(c)).toContain('conteúdo restrito');
    expect(() => pessoaLer('persona/guia-de-estilo.md')).toThrow('só lê a área restrita');
    expect(() => pessoaLer('../fora.md')).toThrow();
  });
});

describe('ferramentas MCP', () => {
  it('registers, lists and reads, with only the path in the audit log', async () => {
    const segredo = 'Conversa privada: pediu para reduzir a carga por motivos pessoais';
    const reg = await call('pessoa_registrar', { pessoa: 'Elisa Prado', tipo: 'conversa', texto: segredo });
    expect(reg.isError).toBe(false);
    const caminho = /Registrado em (\S+)/.exec(reg.text)![1];
    expect((await call('pessoa_listar', { pessoa: 'Elisa Prado' })).text).toContain(caminho);
    expect((await call('pessoa_ler', { caminho })).text).toContain(segredo);

    const log = queryAudit(db);
    expect(JSON.stringify(log)).not.toContain(segredo);
    expect(JSON.stringify(log)).not.toContain('Elisa');
    expect(log.find((a) => a.tool === 'pessoa_registrar')!.restricted_path).toBe(caminho);
    expect(log.find((a) => a.tool === 'pessoa_ler')!.restricted_path).toBe(caminho);
  });

  it('the generic vault tools still refuse the restricted area', async () => {
    const r = await call('vault_ler', { caminho: 'pessoas/elisa-prado' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('Área restrita');
  });

  it('the new conversation channels and the chase fields are exposed', async () => {
    const tools = (await client.listTools()).tools;
    const ler = tools.find((t) => t.name === 'discord_ler_novas')!;
    expect(JSON.stringify(ler.inputSchema)).toContain('cobrancas');
    expect(JSON.stringify(tools.find((t) => t.name === 'tarefa_criar')!.inputSchema)).toContain('cobrarDe');
  });
});

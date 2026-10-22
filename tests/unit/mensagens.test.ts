/**
 * T1.10i — mensagem_propor / aprovacao_consultar through a real MCP client, and the approval message on Discord
 */
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import type { Database } from 'sql.js';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../../src/ponte/app.js';
import { queryAudit } from '../../src/ponte/db/audit.js';
import { getPendingItems, getQueueItem, updateQueueState } from '../../src/ponte/db/queue.js';
import { executeApproved } from '../../src/ponte/middleware/executor.js';
import { announcePending, handleApprovalButton, handleEditSubmit, type ButtonLike, type ModalLike } from '../../src/ponte/discord/bot.js';
import { buildApprovalMessage } from '../../src/ponte/tools/discord.js';
import { makeTestDb } from './helpers.js';

const TOKEN = 'token-de-teste';
const OWNER = '111';
const TEXTO = 'Pessoal, precisamos alinhar essa definição com Produto, pois já estamos com risco no prazo.';
let db: Database;
let server: Server;
let client: Client;

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return { text: (r.content as { text: string }[])[0].text, isError: !!r.isError };
};

const proposta = (extra: Record<string, unknown> = {}) => ({
  destinatario: 'Time Fiscal', canal: 'teams', texto: TEXTO, motivo: 'Entrega em risco', fontes: ['work item #1234'], ...extra,
});

beforeAll(async () => {
  db = await makeTestDb();
  server = createApp(db, TOKEN);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  client = new Client({ name: 'teste', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }));
});

afterAll(async () => {
  await client.close();
  await new Promise<void>((r) => server.close(() => r()));
});

describe('mensagem_propor', () => {
  it('is listed next to aprovacao_consultar', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['mensagem_propor', 'aprovacao_consultar']));
  });

  it('queues the text as pending, with destination, reason and sources, and sends nothing', async () => {
    const r = await call('mensagem_propor', proposta());
    expect(r.isError).toBe(false);
    const id = Number(/#(\d+)/.exec(r.text)![1]);
    const item = getQueueItem(db, id)!;
    expect(item).toMatchObject({ state: 'pendente', tool: 'mensagem_propor', content: TEXTO, destination: 'Time Fiscal (teams)', action: 'Mensagem para Time Fiscal (teams)' });
    expect(item.reason).toContain('Entrega em risco');
    expect(item.reason).toContain('work item #1234');
    expect(r.text).toContain('Nada foi enviado');
  });

  it('keeps the message text out of the audit log', async () => {
    await call('mensagem_propor', proposta({ texto: 'TEXTO-SECRETO-DA-MENSAGEM' }));
    const rows = queryAudit(db, 20).filter((a) => a.tool === 'mensagem_propor');
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain('TEXTO-SECRETO-DA-MENSAGEM');
    expect(JSON.stringify(rows)).toContain('Time Fiscal');
  });

  it('rejects empty or oversized text, empty recipient and empty reason without queueing', async () => {
    const antes = getPendingItems(db).length;
    expect((await call('mensagem_propor', proposta({ texto: '   ' }))).isError).toBe(true);
    expect((await call('mensagem_propor', proposta({ texto: 'x'.repeat(4001) }))).isError).toBe(true);
    expect((await call('mensagem_propor', proposta({ destinatario: '  ' }))).isError).toBe(true);
    expect((await call('mensagem_propor', proposta({ motivo: '  ' }))).isError).toBe(true);
    expect((await call('mensagem_propor', proposta({ canal: 'pombo' }))).isError).toBe(true);
    expect(getPendingItems(db).length).toBe(antes);
  });

  it('never executes without approval: the executor skips it, with or without a handler', async () => {
    const id = Number(/#(\d+)/.exec((await call('mensagem_propor', proposta())).text)![1]);
    const handler = jest.fn(async () => undefined);
    expect(await executeApproved(db, { mensagem_propor: handler })).toBe(0);
    expect(handler).not.toHaveBeenCalled();
    expect(getQueueItem(db, id)?.state).toBe('pendente');
  });
});

describe('aprovacao_consultar', () => {
  const propor = async () => Number(/#(\d+)/.exec((await call('mensagem_propor', proposta())).text)![1]);

  it('pending: not authorized and no final text', async () => {
    const r = JSON.parse((await call('aprovacao_consultar', { id: await propor() })).text);
    expect(r).toMatchObject({ estado: 'pendente', autorizado: false });
    expect(r.textoFinal).toBeUndefined();
  });

  it('approved: authorized, with the original text', async () => {
    const id = await propor();
    updateQueueState(db, id, 'aprovado');
    const r = JSON.parse((await call('aprovacao_consultar', { id })).text);
    expect(r).toMatchObject({ estado: 'aprovado', autorizado: true, textoFinal: TEXTO, destino: 'Time Fiscal (teams)' });
  });

  it('edited: returns the text Paulo edited', async () => {
    const id = await propor();
    updateQueueState(db, id, 'editado', { edited_content: 'Versão do Paulo' });
    const r = JSON.parse((await call('aprovacao_consultar', { id })).text);
    expect(r).toMatchObject({ estado: 'editado', autorizado: true, textoFinal: 'Versão do Paulo' });
  });

  it('refused: not authorized, no text, told not to insist', async () => {
    const id = await propor();
    updateQueueState(db, id, 'recusado');
    const r = JSON.parse((await call('aprovacao_consultar', { id })).text);
    expect(r).toMatchObject({ estado: 'recusado', autorizado: false });
    expect(r.textoFinal).toBeUndefined();
    expect(r.aviso).toContain('recusou');
  });

  it('unknown item is an error', async () => {
    const r = await call('aprovacao_consultar', { id: 99999 });
    expect(r.isError).toBe(true);
  });
});

describe('approval message on Discord', () => {
  it('shows destination, reason and the text', () => {
    const m = buildApprovalMessage(7, 'mensagem_propor', 'Mensagem para Ana (email)', 'Olá, Ana', { destination: 'Ana (email)', reason: 'Cobrança' });
    expect(m).toContain('**Para:** Ana (email)');
    expect(m).toContain('**Motivo:** Cobrança');
    expect(m).toContain('> Olá, Ana');
  });

  it('keeps long texts under the Discord limit and points to the edit button', () => {
    const m = buildApprovalMessage(7, 'mensagem_propor', 'Mensagem para Ana (email)', 'a'.repeat(4000), { destination: 'Ana (email)', reason: 'r'.repeat(500) });
    expect(m.length).toBeLessThanOrEqual(2000);
    expect(m).toContain('texto completo no botão Editar');
  });

  it('is announced on #aprovacoes with the destination and decided by the buttons', async () => {
    const id = Number(/#(\d+)/.exec((await call('mensagem_propor', proposta({ destinatario: 'CTO', canal: 'email' }))).text)![1]);
    const sent: string[] = [];
    await announcePending(db, async (msg) => { sent.push(msg.content); return { id: `m${sent.length}` }; });
    expect(sent.some((c) => c.includes(`#${id}`) && c.includes('**Para:** CTO (email)'))).toBe(true);

    const btn = {
      customId: `aprovar:${id}`, user: { id: OWNER },
      reply: jest.fn(async () => undefined), update: jest.fn(async () => undefined), showModal: jest.fn(async () => undefined),
    } as unknown as ButtonLike & { update: jest.Mock };
    await handleApprovalButton({ db, ownerId: OWNER }, btn);
    expect(getQueueItem(db, id)?.state).toBe('aprovado');
    expect((btn.update.mock.calls[0][0] as { content: string }).content).toContain('**Para:** CTO (email)');

    const id2 = Number(/#(\d+)/.exec((await call('mensagem_propor', proposta())).text)![1]);
    const modal = {
      customId: `editar:${id2}`, user: { id: OWNER }, fields: { getTextInputValue: () => 'Texto ajustado' },
      reply: jest.fn(async () => undefined), update: jest.fn(async () => undefined),
    } as unknown as ModalLike;
    await handleEditSubmit({ db, ownerId: OWNER }, modal);
    expect(getQueueItem(db, id2)).toMatchObject({ state: 'editado', edited_content: 'Texto ajustado' });
  });
});

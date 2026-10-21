/**
 * T0.7 — Discord approval buttons (simulated interactions)
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Database } from 'sql.js';
import { enqueue, getQueueItem, getPendingItems } from '../../src/ponte/db/queue.js';
import { queryAudit } from '../../src/ponte/db/audit.js';
import {
  handleApprovalButton, handleEditSubmit, announcePending, parseCustomId, type ButtonLike, type ModalLike,
} from '../../src/ponte/discord/bot.js';
import { makeTestDb } from './helpers.js';

const OWNER = '111';
let db: Database;
let onDecision: jest.Mock<() => Promise<unknown>>;

beforeEach(async () => {
  db = await makeTestDb();
  onDecision = jest.fn(async () => undefined);
});

function button(customId: string, userId = OWNER) {
  const i = {
    customId, user: { id: userId },
    reply: jest.fn(async () => undefined), update: jest.fn(async () => undefined), showModal: jest.fn(async () => undefined),
  };
  return i as typeof i & ButtonLike;
}

describe('approval buttons', () => {
  it('parses custom ids', () => {
    expect(parseCustomId('aprovar:12')).toEqual({ action: 'aprovar', queueId: 12 });
    expect(parseCustomId('apagar:1')).toBeNull();
  });

  it('Aprovar approves, audits and triggers the executor', async () => {
    const id = enqueue(db, { tool: 'discord_postar', action: 'x', content: 'c' });
    const i = button(`aprovar:${id}`);
    await handleApprovalButton({ db, ownerId: OWNER, onDecision }, i);
    expect(getQueueItem(db, id)?.state).toBe('aprovado');
    expect(i.update).toHaveBeenCalled();
    expect(onDecision).toHaveBeenCalledTimes(1);
    expect(queryAudit(db, 1)[0].tool).toBe('aprovacao');
  });

  it('Recusar refuses and does not trigger the executor', async () => {
    const id = enqueue(db, { tool: 'discord_postar', action: 'x' });
    await handleApprovalButton({ db, ownerId: OWNER, onDecision }, button(`recusar:${id}`));
    expect(getQueueItem(db, id)?.state).toBe('recusado');
    expect(onDecision).not.toHaveBeenCalled();
  });

  it('Editar opens a modal; submitting saves the edit', async () => {
    const id = enqueue(db, { tool: 'discord_postar', action: 'x', content: 'antes' });
    const b = button(`editar:${id}`);
    await handleApprovalButton({ db, ownerId: OWNER, onDecision }, b);
    expect(b.showModal).toHaveBeenCalled();
    expect(getQueueItem(db, id)?.state).toBe('pendente');

    const modal = { ...button(`editar:${id}`), fields: { getTextInputValue: () => 'depois' } } as unknown as ModalLike;
    await handleEditSubmit({ db, ownerId: OWNER, onDecision }, modal);
    const item = getQueueItem(db, id);
    expect(item?.state).toBe('editado');
    expect(item?.edited_content).toBe('depois');
    expect(onDecision).toHaveBeenCalledTimes(1);
  });

  it('ignores anyone but the owner', async () => {
    const id = enqueue(db, { tool: 'discord_postar', action: 'x' });
    const i = button(`aprovar:${id}`, '999');
    await handleApprovalButton({ db, ownerId: OWNER, onDecision }, i);
    expect(getQueueItem(db, id)?.state).toBe('pendente');
    expect(i.reply).toHaveBeenCalled();
    expect(queryAudit(db, 1)[0].result).toBe('error');
    expect(onDecision).not.toHaveBeenCalled();
  });

  it('does not decide twice', async () => {
    const id = enqueue(db, { tool: 'discord_postar', action: 'x' });
    await handleApprovalButton({ db, ownerId: OWNER, onDecision }, button(`recusar:${id}`));
    const again = button(`aprovar:${id}`);
    await handleApprovalButton({ db, ownerId: OWNER, onDecision }, again);
    expect(getQueueItem(db, id)?.state).toBe('recusado');
    expect(again.reply).toHaveBeenCalled();
  });

  it('announces each pending item once', async () => {
    enqueue(db, { tool: 'discord_postar', action: 'a' });
    enqueue(db, { tool: 'discord_postar', action: 'b' });
    const send = jest.fn(async () => ({ id: 'm1' }));
    expect(await announcePending(db, send)).toBe(2);
    expect(await announcePending(db, send)).toBe(0);
    expect(getPendingItems(db).every((x) => x.discord_msg_id === 'm1')).toBe(true);
  });
});

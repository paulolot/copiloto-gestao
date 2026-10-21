/**
 * Task buttons on Discord (simulated interactions)
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import type { Database } from 'sql.js';
import { handleTarefaButton, mensagemTarefasAbertas, parseTarefaId, type TarefaButtonLike } from '../../src/ponte/discord/tarefas.js';
import { queryAudit } from '../../src/ponte/db/audit.js';
import { tarefaCriar, tarefaListar } from '../../src/ponte/tools/tarefas.js';
import { makeTestDb } from './helpers.js';

const OWNER = '111';
let db: Database;
beforeEach(async () => {
  db = await makeTestDb();
});

function clique(customId: string, userId: string, content: string) {
  const calls: { reply?: { content: string; ephemeral: boolean }; update?: { content: string; components: unknown[] } } = {};
  const i: TarefaButtonLike = {
    customId, user: { id: userId }, message: { content },
    reply: async (o) => void (calls.reply = o),
    update: async (o) => void (calls.update = o),
  };
  return { i, calls };
}

describe('mensagem de tarefas', () => {
  it('shows priority, due date, source and one button per open task, 5 per row', () => {
    for (let n = 1; n <= 7; n++) tarefaCriar(db, { titulo: `Tarefa ${n}`, prioridade: n === 1 ? 'alta' : 'media', prazo: n === 1 ? '2026-10-22' : undefined, origem: n === 1 ? 'e-mail do CTO' : undefined });
    const m = mensagemTarefasAbertas(db);
    expect(m.content).toContain('`#1` 🔴 Tarefa 1 (prazo 22/10/2026 · fonte: e-mail do CTO)');
    expect(m.components).toHaveLength(2);
    expect(m.components[0].components).toHaveLength(5);
    expect(m.components[1].components).toHaveLength(2);
  });

  it('caps the message and says how many were left out', () => {
    for (let n = 1; n <= 18; n++) tarefaCriar(db, { titulo: `T${n}` });
    const m = mensagemTarefasAbertas(db);
    expect(m.content).toContain('e mais 3 tarefa(s)');
    expect(m.content.length).toBeLessThan(2000);
    expect(m.components).toHaveLength(3);
  });

  it('parses only task ids', () => {
    expect(parseTarefaId('tarefa:12')).toBe(12);
    expect(parseTarefaId('aprovar:12')).toBeNull();
  });
});

describe('botão Feita', () => {
  it('completes the task, strikes it through and removes its button', async () => {
    const a = tarefaCriar(db, { titulo: 'Primeira' });
    const b = tarefaCriar(db, { titulo: 'Segunda' });
    const { i, calls } = clique(`tarefa:${a}`, OWNER, mensagemTarefasAbertas(db).content);
    await handleTarefaButton({ db, ownerId: OWNER }, i);
    expect(tarefaListar(db).map((t) => t.id)).toEqual([b]);
    expect(calls.update!.content).toContain(`~~\`#${a}\``);
    expect(calls.update!.components).toHaveLength(1);
    expect(queryAudit(db).some((x) => x.tool === 'tarefa_concluir_discord' && x.result === 'ok')).toBe(true);
  });

  it('refuses anyone but the owner and leaves the task open', async () => {
    const a = tarefaCriar(db, { titulo: 'Primeira' });
    const { i, calls } = clique(`tarefa:${a}`, '999', mensagemTarefasAbertas(db).content);
    await handleTarefaButton({ db, ownerId: OWNER }, i);
    expect(calls.reply!.ephemeral).toBe(true);
    expect(calls.update).toBeUndefined();
    expect(tarefaListar(db)).toHaveLength(1);
    expect(queryAudit(db).some((x) => x.tool === 'tarefa_concluir_discord' && x.result === 'error')).toBe(true);
  });

  it('answers privately when the task is already done', async () => {
    const a = tarefaCriar(db, { titulo: 'Primeira' });
    const content = mensagemTarefasAbertas(db).content;
    await handleTarefaButton({ db, ownerId: OWNER }, clique(`tarefa:${a}`, OWNER, content).i);
    const { i, calls } = clique(`tarefa:${a}`, OWNER, content);
    await handleTarefaButton({ db, ownerId: OWNER }, i);
    expect(calls.reply!.content).toContain('já está concluída');
  });
});

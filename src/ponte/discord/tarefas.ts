/**
 * Task list on Discord (RF-08): one message with the open tasks and a "Feita" button per task.
 * The message is rebuilt from the database on every click, so it always shows the real state.
 * Only DISCORD_OWNER_ID can click; each click is written to the audit log.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { Database } from 'sql.js';
import { logAudit } from '../db/audit.js';
import { tarefaConcluir, tarefaListar, type Tarefa } from '../tools/tarefas.js';

export const MAX_TAREFAS_NA_MENSAGEM = 15;
const ICONE = { alta: '🔴', media: '🟡', baixa: '⚪' } as const;

export function tarefaCustomId(id: number): string {
  return `tarefa:${id}`;
}
export function parseTarefaId(customId: string): number | null {
  const m = /^tarefa:(\d+)$/.exec(customId);
  return m ? Number(m[1]) : null;
}

const dataBr = (d: string) => d.split('-').reverse().join('/');

function linha(t: Tarefa): string {
  const titulo = t.titulo.length > 90 ? `${t.titulo.slice(0, 89)}…` : t.titulo;
  const resto = [t.cobrarDe ? `cobrar de ${t.cobrarDe}` : '', t.lembrarEm ? `lembrar ${dataBr(t.lembrarEm)}` : '', t.prazo ? `prazo ${dataBr(t.prazo)}` : '', t.origem ? `fonte: ${t.origem.slice(0, 60)}` : ''].filter(Boolean).join(' · ');
  const base = `\`#${t.id}\` ${t.cobrarDe ? '🔔' : ICONE[t.prioridade]} ${titulo}${resto ? ` (${resto})` : ''}`;
  return t.estado === 'feita' ? `~~${base}~~ ✅` : base;
}

export interface MensagemTarefas {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
}

/** Message for the given task ids, in the given order; done tasks are struck through and lose their button. */
export function montarMensagemTarefas(db: Database, ids: number[], extras = 0): MensagemTarefas {
  const todas = new Map(tarefaListar(db, { incluirFeitas: true }).map((t) => [t.id, t]));
  const tarefas = ids.map((id) => todas.get(id)).filter((t): t is Tarefa => !!t);
  const abertas = tarefas.filter((t) => t.estado === 'aberta');
  const linhas = tarefas.map(linha);
  if (extras > 0) linhas.push(`_…e mais ${extras} tarefa(s) abertas; peça a lista completa ao Copiloto._`);
  const content = tarefas.length ? `📋 **Tarefas do Paulo**\n${linhas.join('\n')}` : '📋 **Tarefas do Paulo**\nNenhuma tarefa aberta.';

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < abertas.length; i += 5) {
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      abertas.slice(i, i + 5).map((t) => new ButtonBuilder().setCustomId(tarefaCustomId(t.id)).setLabel(`✔ #${t.id}`).setStyle(ButtonStyle.Success)),
    ));
  }
  return { content, components };
}

/** The message with the open tasks, ready to post. */
export function mensagemTarefasAbertas(db: Database): MensagemTarefas {
  const abertas = tarefaListar(db);
  return montarMensagemTarefas(db, abertas.slice(0, MAX_TAREFAS_NA_MENSAGEM).map((t) => t.id), Math.max(0, abertas.length - MAX_TAREFAS_NA_MENSAGEM));
}

/** The parts of a discord.js button interaction the handler uses (lets tests pass a simulated one). */
export interface TarefaButtonLike {
  customId: string;
  user: { id: string };
  message: { content: string };
  reply(options: { content: string; ephemeral: boolean }): Promise<unknown>;
  update(options: { content: string; components: ActionRowBuilder<ButtonBuilder>[] }): Promise<unknown>;
}

export async function handleTarefaButton(deps: { db: Database; ownerId: string }, i: TarefaButtonLike): Promise<void> {
  const id = parseTarefaId(i.customId);
  if (id === null) return;
  const audit = (result: 'ok' | 'error', error?: string) =>
    logAudit(deps.db, { tool: 'tarefa_concluir_discord', params: { id }, origin: `discord:${i.user.id}`, result, error_msg: error });

  if (i.user.id !== deps.ownerId) {
    audit('error', 'Usuário não autorizado');
    await i.reply({ content: `Só o Paulo pode concluir tarefas. (Seu ID no Discord é ${i.user.id}; se você é o Paulo, ele precisa ser o DISCORD_OWNER_ID do .env.)`, ephemeral: true });
    return;
  }
  try {
    tarefaConcluir(deps.db, id);
  } catch (e) {
    audit('error', (e as Error).message);
    await i.reply({ content: (e as Error).message, ephemeral: true });
    return;
  }
  audit('ok');
  const ids = [...i.message.content.matchAll(/`#(\d+)`/g)].map((m) => Number(m[1]));
  const extras = Number(/e mais (\d+) tarefa/.exec(i.message.content)?.[1] ?? 0);
  await i.update(montarMensagemTarefas(deps.db, ids, extras));
}

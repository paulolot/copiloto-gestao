/**
 * T0.7 — Discord bot: approval queue on #aprovacoes
 * Every pending queue item is shown with Aprovar / Editar / Recusar buttons.
 * Only DISCORD_OWNER_ID (Paulo) can click; every decision is written to the queue and the audit log.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  GatewayIntentBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Interaction,
} from 'discord.js';
import type { Database } from 'sql.js';
import { logAudit } from '../db/audit.js';
import { getQueueItem, getUnannouncedItems, setQueueDiscordMessage, updateQueueState } from '../db/queue.js';
import { buildApprovalMessage } from '../tools/discord.js';

export type ApprovalAction = 'aprovar' | 'editar' | 'recusar';

export interface ApprovalDeps {
  db: Database;
  ownerId: string;
  /** Called after an item is approved or edited, so the executor can run it. */
  onDecision?: () => Promise<unknown>;
}

/** The parts of a discord.js interaction the handlers use (lets tests pass a simulated one). */
export interface InteractionLike {
  customId: string;
  user: { id: string };
  reply(options: { content: string; ephemeral: boolean }): Promise<unknown>;
  update(options: { content: string; components: [] }): Promise<unknown>;
}
export interface ButtonLike extends InteractionLike {
  showModal(modal: ModalBuilder): Promise<unknown>;
}
export interface ModalLike extends InteractionLike {
  fields: { getTextInputValue(id: string): string };
}

const EDIT_FIELD = 'conteudo';

export function approvalCustomId(action: ApprovalAction, queueId: number): string {
  return `${action}:${queueId}`;
}

export function parseCustomId(customId: string): { action: ApprovalAction; queueId: number } | null {
  const m = /^(aprovar|editar|recusar):(\d+)$/.exec(customId);
  return m ? { action: m[1] as ApprovalAction, queueId: Number(m[2]) } : null;
}

export function approvalButtons(queueId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(approvalCustomId('aprovar', queueId)).setLabel('Aprovar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(approvalCustomId('editar', queueId)).setLabel('Editar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(approvalCustomId('recusar', queueId)).setLabel('Recusar').setStyle(ButtonStyle.Danger),
  );
}

function audit(deps: ApprovalDeps, userId: string, action: string, queueId: number, result: 'ok' | 'error', error?: string) {
  logAudit(deps.db, {
    tool: 'aprovacao',
    params: { acao: action, fila: queueId },
    origin: `discord:${userId}`,
    result,
    error_msg: error,
  });
}

/** Handles the Aprovar / Editar / Recusar buttons. */
export async function handleApprovalButton(deps: ApprovalDeps, i: ButtonLike): Promise<void> {
  const parsed = parseCustomId(i.customId);
  if (!parsed) return;
  const { action, queueId } = parsed;

  if (i.user.id !== deps.ownerId) {
    audit(deps, i.user.id, action, queueId, 'error', 'Usuário não autorizado');
    await i.reply({ content: 'Só o Paulo pode decidir sobre itens da fila.', ephemeral: true });
    return;
  }

  const item = getQueueItem(deps.db, queueId);
  if (!item || item.state !== 'pendente') {
    await i.reply({ content: `Item #${queueId} não está mais pendente (${item?.state ?? 'inexistente'}).`, ephemeral: true });
    return;
  }

  if (action === 'editar') {
    const modal = new ModalBuilder()
      .setCustomId(approvalCustomId('editar', queueId))
      .setTitle(`Editar item #${queueId}`)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(EDIT_FIELD)
            .setLabel('Conteúdo final')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(4000)
            .setValue((item.content ?? '').slice(0, 4000))
            .setRequired(true),
        ),
      );
    await i.showModal(modal);
    return;
  }

  const state = action === 'aprovar' ? 'aprovado' : 'recusado';
  updateQueueState(deps.db, queueId, state);
  audit(deps, i.user.id, action, queueId, 'ok');
  await i.update({ content: `${buildApprovalMessage(queueId, item.tool, item.action, item.content)}\n\n**${state.toUpperCase()}**`, components: [] });
  if (state === 'aprovado') await deps.onDecision?.();
}

/** Handles the submit of the edit modal. */
export async function handleEditSubmit(deps: ApprovalDeps, i: ModalLike): Promise<void> {
  const parsed = parseCustomId(i.customId);
  if (!parsed || parsed.action !== 'editar') return;
  const { queueId } = parsed;

  if (i.user.id !== deps.ownerId) {
    audit(deps, i.user.id, 'editar', queueId, 'error', 'Usuário não autorizado');
    await i.reply({ content: 'Só o Paulo pode decidir sobre itens da fila.', ephemeral: true });
    return;
  }

  const item = getQueueItem(deps.db, queueId);
  if (!item || item.state !== 'pendente') {
    await i.reply({ content: `Item #${queueId} não está mais pendente.`, ephemeral: true });
    return;
  }

  const edited = i.fields.getTextInputValue(EDIT_FIELD);
  updateQueueState(deps.db, queueId, 'editado', { edited_content: edited });
  audit(deps, i.user.id, 'editar', queueId, 'ok');
  await i.update({ content: `${buildApprovalMessage(queueId, item.tool, item.action, edited)}\n\n**EDITADO E APROVADO**`, components: [] });
  await deps.onDecision?.();
}

/** Posts every pending item that is not on Discord yet to #aprovacoes. Returns how many were posted. */
export async function announcePending(
  db: Database,
  send: (message: { content: string; components: ActionRowBuilder<ButtonBuilder>[] }) => Promise<{ id: string }>,
): Promise<number> {
  let posted = 0;
  for (const item of getUnannouncedItems(db)) {
    if (item.id === undefined) continue;
    const msg = await send({
      content: buildApprovalMessage(item.id, item.tool, item.action, item.content),
      components: [approvalButtons(item.id)],
    });
    setQueueDiscordMessage(db, item.id, msg.id);
    posted++;
  }
  return posted;
}

/** Connects the bot, announces pending items and routes button/modal interactions. */
export async function startBot(deps: ApprovalDeps & { token: string; canalAprovacoesId: string; pollMs?: number }): Promise<Client> {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.on('interactionCreate', (i: Interaction) => {
    const run = async () => {
      if (i.isButton()) await handleApprovalButton(deps, i);
      else if (i.isModalSubmit()) await handleEditSubmit(deps, i as unknown as ModalLike);
    };
    run().catch((e) => console.error('Erro ao tratar interação do Discord:', (e as Error).message));
  });

  await client.login(deps.token);

  const tick = async () => {
    try {
      const channel = await client.channels.fetch(deps.canalAprovacoesId);
      if (!channel?.isSendable()) return;
      await announcePending(deps.db, (m) => channel.send(m));
    } catch (e) {
      console.error('Erro ao anunciar a fila no Discord:', (e as Error).message);
    }
  };
  await tick();
  const timer = setInterval(tick, deps.pollMs ?? 5000);
  timer.unref();
  return client;
}

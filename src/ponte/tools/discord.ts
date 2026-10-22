/**
 * T0.7 — Discord tool (ponte side)
 * Posting is done via REST (no persistent connection needed from MCP server).
 * The Discord bot (../discord/bot.ts) handles the interactive approval buttons.
 *
 * Autonomy level: sozinho (posting to Paulo's private server only)
 */

export type DiscordCanal =
  | 'briefing'
  | 'alertas'
  | 'aprovacoes'
  | 'reunioes'
  | 'pessoas'
  | 'cto'
  | 'planejamento';

const CANAL_ENV_MAP: Record<DiscordCanal, string> = {
  briefing: 'DISCORD_CANAL_BRIEFING',
  alertas: 'DISCORD_CANAL_ALERTAS',
  aprovacoes: 'DISCORD_CANAL_APROVACOES',
  reunioes: 'DISCORD_CANAL_REUNIOES',
  pessoas: 'DISCORD_CANAL_PESSOAS',
  cto: 'DISCORD_CANAL_CTO',
  planejamento: 'DISCORD_CANAL_PLANEJAMENTO',
};

function getCanalId(canal: DiscordCanal): string {
  const env = CANAL_ENV_MAP[canal];
  const id = process.env[env];
  if (!id) throw new Error(`Canal "${canal}" não configurado (${env} ausente)`);
  return id;
}

import type { Database } from 'sql.js';
import { persist } from '../db/database.js';

export interface PostResult {
  messageId: string;
  canal: DiscordCanal;
}

/** `components` are Discord message components already in JSON (buttons handled by the bot). */
export async function discordPostar(canal: DiscordCanal, texto: string, components?: unknown[]): Promise<PostResult> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN não configurado');

  const channelId = getCanalId(canal);

  const resp = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    // allowed_mentions: text written by the model must never ping @everyone or roles
    body: JSON.stringify({ content: texto, allowed_mentions: { parse: [] }, ...(components?.length ? { components } : {}) }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    throw new Error(`Discord API error ${resp.status}`);
  }

  const data = await resp.json() as { id: string };
  return { messageId: data.id, canal };
}

export function buildApprovalMessage(queueId: number, tool: string, action: string, content?: string): string {
  const preview = content ? `\n> ${content.slice(0, 300).replace(/\n/g, '\n> ')}` : '';
  return `🔔 **Aprovação necessária** (ID #${queueId})\n**Ferramenta:** \`${tool}\`\n**Ação:** ${action}${preview}\n\nUse os botões abaixo para aprovar, editar ou recusar.`;
}

/** Channels where Paulo talks to the Copiloto; only his messages are read from them. */
export type CanalConversa = 'planejamento';

export interface MensagemDiscord {
  id: string;
  em: string;
  texto: string;
}

export interface NovasMensagens {
  mensagens: MensagemDiscord[];
  /** Pass this id to marcarLido once the messages were dealt with; they are not returned again. */
  ateId?: string;
  ignoradas: number;
  semConteudo: number;
}

const maior = (a: string, b: string) => (BigInt(a) > BigInt(b) ? a : b);

/**
 * New messages written by the owner in a conversation channel, oldest first.
 * Messages from other people or bots are ignored: the channel is an input to the Copiloto, so only Paulo's
 * words count as instructions. The cursor only moves when the caller acknowledges (marcarLido), so a failure
 * in between loses nothing.
 */
export async function discordLerNovas(
  db: Database,
  canal: CanalConversa,
  ownerId: string,
  f: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<NovasMensagens> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN não configurado');
  const channelId = getCanalId(canal);
  const cursor = db.exec('SELECT ultimo_id FROM discord_cursor WHERE canal = ?', [canal])[0]?.values[0]?.[0] as string | undefined;

  const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=${cursor ? 50 : 10}${cursor ? `&after=${cursor}` : ''}`;
  const resp = await f(url, { headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(10_000) });
  if (!resp.ok) throw new Error(`Discord API error ${resp.status}`);
  const todas = (await resp.json()) as { id: string; content: string; timestamp: string; author: { id: string; bot?: boolean }; attachments?: unknown[] }[];

  const ordenadas = todas.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  const doDono = ordenadas.filter((m) => m.author.id === ownerId && !m.author.bot);
  // Without the "Message Content" intent Discord returns empty text for messages that do not mention the bot.
  const semConteudo = doDono.filter((m) => !m.content && !m.attachments?.length).length;
  return {
    mensagens: doDono.filter((m) => m.content).map((m) => ({ id: m.id, em: m.timestamp, texto: m.content })),
    ateId: ordenadas.length ? ordenadas[ordenadas.length - 1].id : undefined,
    ignoradas: ordenadas.length - doDono.length,
    semConteudo,
  };
}

export function discordMarcarLido(db: Database, canal: CanalConversa, ateId: string): void {
  if (!/^\d+$/.test(ateId)) throw new Error('ateId inválido');
  const atual = db.exec('SELECT ultimo_id FROM discord_cursor WHERE canal = ?', [canal])[0]?.values[0]?.[0] as string | undefined;
  db.run(
    `INSERT INTO discord_cursor (canal, ultimo_id) VALUES (?, ?)
     ON CONFLICT(canal) DO UPDATE SET ultimo_id = excluded.ultimo_id, atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    [canal, atual ? maior(atual, ateId) : ateId],
  );
  persist(db);
}

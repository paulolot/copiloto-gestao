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
  | 'cto';

const CANAL_ENV_MAP: Record<DiscordCanal, string> = {
  briefing: 'DISCORD_CANAL_BRIEFING',
  alertas: 'DISCORD_CANAL_ALERTAS',
  aprovacoes: 'DISCORD_CANAL_APROVACOES',
  reunioes: 'DISCORD_CANAL_REUNIOES',
  pessoas: 'DISCORD_CANAL_PESSOAS',
  cto: 'DISCORD_CANAL_CTO',
};

function getCanalId(canal: DiscordCanal): string {
  const env = CANAL_ENV_MAP[canal];
  const id = process.env[env];
  if (!id) throw new Error(`Canal "${canal}" não configurado (${env} ausente)`);
  return id;
}

export interface PostResult {
  messageId: string;
  canal: DiscordCanal;
}

export async function discordPostar(canal: DiscordCanal, texto: string): Promise<PostResult> {
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
    body: JSON.stringify({ content: texto, allowed_mentions: { parse: [] } }),
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

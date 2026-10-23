/**
 * Ponte MCP — entry point.
 * Starts the HTTP server (MCP tools) and, when configured, the Discord approval bot.
 */
import { getDb } from './db/database.js';
import { createApp } from './app.js';
import { executeApproved, type ExecutionHandler } from './middleware/executor.js';
import { startBot } from './discord/bot.js';
import { mapaCanais } from './discord/comandos.js';
import { AzdoClient } from './azure/client.js';
import { iniciarAgendador } from './agendador.js';
import { discordPostar } from './tools/discord.js';
import { IndiceVault } from './vault/indice.js';
import { LocalEmbedder } from './vault/embedder.js';

const PORT = parseInt(process.env.PONTE_PORT ?? '3333', 10);
const TOKEN = process.env.PONTE_TOKEN ?? '';
const PLACEHOLDER_TOKEN = 'troque_por_token_aleatorio_forte';

async function main() {
  if (!TOKEN || TOKEN === PLACEHOLDER_TOKEN) {
    throw new Error('PONTE_TOKEN não configurado (ou ainda com o valor de exemplo). Veja docs/conectar.md, passo 1.');
  }

  const db = await getDb(process.env.DB_PATH);

  // mensagem_propor (pede_ok) has no sending handler on purpose: Paulo copies the approved text and sends it himself.
  // Handlers are registered here as tools that act on approval are added.
  const handlers: Record<string, ExecutionHandler> = {};
  const runExecutor = () => executeApproved(db, handlers);

  const { DISCORD_BOT_TOKEN, DISCORD_OWNER_ID, DISCORD_CANAL_APROVACOES } = process.env;
  if (DISCORD_BOT_TOKEN && DISCORD_OWNER_ID && DISCORD_CANAL_APROVACOES) {
    // The bridge is useful without the approval bot, so a bad Discord config must not stop it.
    try {
      await startBot({
        db,
        ownerId: DISCORD_OWNER_ID.trim().replace(/^["']|["']$/g, ''), // tolerate quotes and stray spaces from a hand-edited .env
        token: DISCORD_BOT_TOKEN,
        canalAprovacoesId: DISCORD_CANAL_APROVACOES,
        guildId: process.env.DISCORD_GUILD_ID,
        canais: mapaCanais(),
        onDecision: runExecutor,
      });
      console.log('Bot do Discord conectado (fila de aprovações em #aprovacoes)');
    } catch (e) {
      console.error(`Bot do Discord NÃO iniciou: ${(e as Error).message}. Confira DISCORD_BOT_TOKEN, DISCORD_OWNER_ID e DISCORD_CANAL_APROVACOES no .env; a ponte segue sem a fila de aprovações.`);
    }
  } else {
    console.warn('Bot do Discord desativado: defina DISCORD_BOT_TOKEN, DISCORD_OWNER_ID e DISCORD_CANAL_APROVACOES');
  }

  // Azure DevOps (read only). Without a PAT the bridge still runs; the board tools just say it is not configured.
  let azdo: AzdoClient | undefined;
  if (process.env.AZDO_PAT && process.env.AZDO_ORG) {
    azdo = new AzdoClient({ org: process.env.AZDO_ORG, pat: process.env.AZDO_PAT });
    if (process.env.AZDO_SYNC_AGENDADO !== 'nao') {
      if (['1', 'true', 'sim'].includes((process.env.ALERTAS_REANUNCIAR ?? '').toLowerCase())) {
        db.run('UPDATE sinais SET avisado = 0 WHERE ativo = 1');
        console.log('Sinais ativos serão avisados de novo no próximo ciclo (ALERTAS_REANUNCIAR): remova a variável depois');
      }
      iniciarAgendador({
        db, azdo, postar: (canal, texto) => discordPostar(canal, texto),
        org: process.env.AZDO_ORG, comResponsavel: !['0', 'false', 'nao', 'não'].includes((process.env.ALERTAS_COM_RESPONSAVEL ?? '').toLowerCase()),
      });
      console.log('Sincronização do Azure DevOps agendada (dias úteis, 7h às 17h, de hora em hora)');
    }
  } else {
    console.warn('Azure DevOps desativado: defina AZDO_ORG e AZDO_PAT (veja docs/conectar.md)');
  }

  // Semantic search (local embeddings). Off unless EMBEDDER=local; the model is validated on Paulo's machine.
  let indice: IndiceVault | undefined;
  if ((process.env.EMBEDDER ?? '').toLowerCase() === 'local') {
    indice = await IndiceVault.abrir(new LocalEmbedder(), process.env.INDICE_PATH ?? `${process.env.DB_PATH ?? './copiloto.db'}.indice`);
    console.log('Busca por significado ligada (modelo local; a primeira indexação roda na primeira busca ou em vault_reindexar)');
  } else {
    console.warn('Busca por significado desativada: defina EMBEDDER=local (veja docs/conectar.md)');
  }

  // Tunnel (cloudflared) connects to localhost, so there is no need to listen on other interfaces.
  createApp(db, TOKEN, { azdo, indice }).listen(PORT, '127.0.0.1', () => {
    console.log(`Ponte MCP no ar: http://localhost:${PORT}/mcp`);
    console.log(`Saúde: http://localhost:${PORT}/health`);
  });
}

main().catch((e) => {
  console.error('Falha ao iniciar a ponte:', (e as Error).message);
  process.exit(1);
});

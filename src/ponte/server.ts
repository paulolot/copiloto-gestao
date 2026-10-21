/**
 * T0.3 — MCP server (Streamable HTTP transport)
 * Authentication: Bearer token in Authorization header, compared in constant time.
 * Exposes: ping, vault_listar, vault_ler, vault_buscar, vault_criar_nota, discord_postar
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { z } from 'zod';
import { getDb } from './db/database.js';
import { logAudit } from './db/audit.js';
import { enforcePolicy } from './middleware/autonomy.js';
import { vaultListar, vaultLer, vaultBuscar, vaultCriarNota } from './tools/vault.js';
import { discordPostar, type DiscordCanal } from './tools/discord.js';

const PORT = parseInt(process.env.PONTE_PORT ?? '3333', 10);
const TOKEN = process.env.PONTE_TOKEN ?? '';

/** Constant-time comparison to prevent timing attacks */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a dummy comparison to take constant time
    let dummy = 0;
    for (let i = 0; i < a.length; i++) dummy ^= a.charCodeAt(i);
    return dummy === -1; // never true
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function authenticate(req: IncomingMessage): boolean {
  if (!TOKEN) return false; // token must be configured
  const auth = req.headers['authorization'] ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return safeCompare(bearer, TOKEN);
}

async function main() {
  const db = await getDb(process.env.DB_PATH);

  const mcp = new McpServer({
    name: 'copiloto-gestao',
    version: '0.1.0',
  });

  // ── ping ──────────────────────────────────────────────────────────────────
  mcp.tool('ping', 'Verifica se a ponte está no ar', {}, async () => {
    logAudit(db, { tool: 'ping', result: 'ok', duration_ms: 0 });
    return { content: [{ type: 'text', text: 'pong' }] };
  });

  // ── vault_listar ──────────────────────────────────────────────────────────
  mcp.tool(
    'vault_listar',
    'Lista arquivos e pastas do vault (área restrita excluída)',
    { pasta: z.string().optional().describe('Sub-pasta a listar (padrão: raiz)') },
    async ({ pasta }) => {
      const start = Date.now();
      try {
        const items = vaultListar(pasta);
        logAudit(db, { tool: 'vault_listar', params: { pasta }, result: 'ok', duration_ms: Date.now() - start });
        return { content: [{ type: 'text', text: items.join('\n') }] };
      } catch (e) {
        const msg = (e as Error).message;
        logAudit(db, { tool: 'vault_listar', params: { pasta }, result: 'error', error_msg: msg, duration_ms: Date.now() - start });
        return { content: [{ type: 'text', text: `Erro: ${msg}` }], isError: true };
      }
    },
  );

  // ── vault_ler ─────────────────────────────────────────────────────────────
  mcp.tool(
    'vault_ler',
    'Lê uma nota do vault',
    { caminho: z.string().describe('Caminho relativo à raiz do vault') },
    async ({ caminho }) => {
      const start = Date.now();
      const isRestricted = caminho.startsWith('pessoas/');
      try {
        const content = vaultLer(caminho, false);
        logAudit(db, {
          tool: 'vault_ler',
          params: { caminho: '[PATH]' },
          result: 'ok',
          duration_ms: Date.now() - start,
          restricted_path: isRestricted ? caminho : undefined,
        });
        return { content: [{ type: 'text', text: content }] };
      } catch (e) {
        const msg = (e as Error).message;
        logAudit(db, { tool: 'vault_ler', result: 'error', error_msg: msg, duration_ms: Date.now() - start });
        return { content: [{ type: 'text', text: `Erro: ${msg}` }], isError: true };
      }
    },
  );

  // ── vault_buscar ──────────────────────────────────────────────────────────
  mcp.tool(
    'vault_buscar',
    'Busca por palavra-chave nas notas (área restrita excluída)',
    {
      texto: z.string().describe('Texto a buscar'),
      pasta: z.string().optional().describe('Limitar a uma sub-pasta'),
    },
    async ({ texto, pasta }) => {
      const start = Date.now();
      try {
        const results = vaultBuscar(texto, { pasta });
        logAudit(db, { tool: 'vault_buscar', params: { texto, pasta }, result: 'ok', duration_ms: Date.now() - start });
        const out = results.map((r) => `**${r.caminho}**\n${r.trecho}`).join('\n\n---\n\n');
        return { content: [{ type: 'text', text: out || 'Nenhum resultado.' }] };
      } catch (e) {
        const msg = (e as Error).message;
        logAudit(db, { tool: 'vault_buscar', result: 'error', error_msg: msg, duration_ms: Date.now() - start });
        return { content: [{ type: 'text', text: `Erro: ${msg}` }], isError: true };
      }
    },
  );

  // ── vault_criar_nota ──────────────────────────────────────────────────────
  mcp.tool(
    'vault_criar_nota',
    'Cria uma nota no vault (vai para inbox/ com revisado: false)',
    {
      tipo: z.string().describe('Tipo da nota (reuniao, decisao, pessoa, atencao, conquista)'),
      titulo: z.string().describe('Título da nota'),
      conteudo: z.string().describe('Conteúdo em markdown'),
      fontes: z.array(z.string()).optional().describe('Fontes citadas'),
      pasta: z.string().optional().describe('Destino (padrão: inbox)'),
    },
    async (args) => {
      const start = Date.now();
      // pede_ok — needs Paulo's approval before creating
      const policy = enforcePolicy(db, {
        tool: 'vault_criar_nota',
        level: 'pede_ok',
        action: `Criar nota: "${args.titulo}"`,
        content: args.conteudo.slice(0, 500),
        reason: `Tipo: ${args.tipo}`,
        params: { tipo: args.tipo, titulo: args.titulo },
      });

      if (!policy.allowed && policy.queued) {
        logAudit(db, { tool: 'vault_criar_nota', params: { tipo: args.tipo, titulo: args.titulo }, result: 'ok', duration_ms: Date.now() - start });
        return {
          content: [{
            type: 'text',
            text: `Aguardando aprovação (fila #${policy.queueId}). Paulo será notificado no Discord.`,
          }],
        };
      }
      if (!policy.allowed) {
        return { content: [{ type: 'text', text: policy.reason }], isError: true };
      }

      try {
        const path = vaultCriarNota(args);
        logAudit(db, { tool: 'vault_criar_nota', result: 'ok', duration_ms: Date.now() - start });
        return { content: [{ type: 'text', text: `Nota criada: ${path}` }] };
      } catch (e) {
        const msg = (e as Error).message;
        logAudit(db, { tool: 'vault_criar_nota', result: 'error', error_msg: msg, duration_ms: Date.now() - start });
        return { content: [{ type: 'text', text: `Erro: ${msg}` }], isError: true };
      }
    },
  );

  // ── discord_postar ────────────────────────────────────────────────────────
  mcp.tool(
    'discord_postar',
    'Posta uma mensagem em um canal do Discord do servidor privado do Paulo',
    {
      canal: z.enum(['briefing', 'alertas', 'aprovacoes', 'reunioes', 'pessoas', 'cto'])
        .describe('Canal de destino'),
      texto: z.string().max(2000).describe('Mensagem (máx 2000 caracteres)'),
    },
    async ({ canal, texto }) => {
      const start = Date.now();
      // sozinho — posting to Paulo's own private server
      const policy = enforcePolicy(db, {
        tool: 'discord_postar',
        level: 'sozinho',
        action: `Postar em #${canal}`,
      });

      if (!policy.allowed) {
        return { content: [{ type: 'text', text: 'allowed' in policy ? policy.reason : 'Na fila' }], isError: true };
      }

      try {
        const result = await discordPostar(canal as DiscordCanal, texto);
        logAudit(db, { tool: 'discord_postar', params: { canal }, result: 'ok', duration_ms: Date.now() - start });
        return { content: [{ type: 'text', text: `Mensagem enviada (ID: ${result.messageId})` }] };
      } catch (e) {
        const msg = (e as Error).message;
        logAudit(db, { tool: 'discord_postar', params: { canal }, result: 'error', error_msg: msg, duration_ms: Date.now() - start });
        return { content: [{ type: 'text', text: `Erro: ${msg}` }], isError: true };
      }
    },
  );

  // ── HTTP server with auth middleware ──────────────────────────────────────
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Health check (no auth required)
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', ts: new Date().toISOString() }));
      return;
    }

    // Auth
    if (!authenticate(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // MCP transport
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  });

  httpServer.listen(PORT, () => {
    console.log(`Ponte MCP no ar: http://localhost:${PORT}`);
    console.log(`Saúde: http://localhost:${PORT}/health`);
  });
}

main().catch((e) => {
  console.error('Falha ao iniciar a ponte:', e);
  process.exit(1);
});

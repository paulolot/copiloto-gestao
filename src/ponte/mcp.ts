/**
 * T0.3 — MCP tool definitions
 * Exposes: ping, vault_listar, vault_ler, vault_buscar, vault_criar_nota, discord_postar
 *
 * Every call goes through `audited`, so no tool can forget to write the audit log.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Database } from 'sql.js';
import { logAudit } from './db/audit.js';
import { enforcePolicy } from './middleware/autonomy.js';
import { vaultListar, vaultLer, vaultBuscar, vaultCriarNota } from './tools/vault.js';
import { discordPostar } from './tools/discord.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError } : {}) });

/** Runs a tool body, recording tool, params (no secrets), result and duration in the audit log. */
async function audited(
  db: Database,
  tool: string,
  params: Record<string, unknown>,
  body: () => Promise<string> | string,
): Promise<ToolResult> {
  const start = Date.now();
  try {
    const out = await body();
    logAudit(db, { tool, params, origin: 'mcp', result: 'ok', duration_ms: Date.now() - start });
    return text(out);
  } catch (e) {
    const msg = (e as Error).message;
    logAudit(db, { tool, params, origin: 'mcp', result: 'error', error_msg: msg, duration_ms: Date.now() - start });
    return text(`Erro: ${msg}`, true);
  }
}

export function createMcpServer(db: Database): McpServer {
  const mcp = new McpServer({ name: 'copiloto-gestao', version: '0.1.0' });

  mcp.tool('ping', 'Verifica se a ponte está no ar', {}, () => audited(db, 'ping', {}, () => 'pong'));

  mcp.tool(
    'vault_listar',
    'Lista arquivos e pastas do vault (área restrita excluída)',
    { pasta: z.string().optional().describe('Sub-pasta a listar (padrão: raiz)') },
    ({ pasta }) => audited(db, 'vault_listar', { pasta }, () => vaultListar(pasta).join('\n')),
  );

  mcp.tool(
    'vault_ler',
    'Lê uma nota do vault (área restrita bloqueada)',
    { caminho: z.string().describe('Caminho relativo à raiz do vault') },
    ({ caminho }) => audited(db, 'vault_ler', { caminho }, () => vaultLer(caminho, false)),
  );

  mcp.tool(
    'vault_buscar',
    'Busca por palavra-chave nas notas (área restrita excluída)',
    {
      texto: z.string().min(1).describe('Texto a buscar'),
      pasta: z.string().optional().describe('Limitar a uma sub-pasta'),
      dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Data mínima (AAAA-MM-DD) do frontmatter'),
      dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Data máxima (AAAA-MM-DD) do frontmatter'),
    },
    ({ texto, pasta, dataInicio, dataFim }) =>
      audited(db, 'vault_buscar', { texto, pasta, dataInicio, dataFim }, () => {
        const results = vaultBuscar(texto, { pasta, dataInicio, dataFim });
        return results.map((r) => `**${r.caminho}**\n${r.trecho}`).join('\n\n---\n\n') || 'Nenhum resultado.';
      }),
  );

  // Nível `sozinho` (plano.md → "Criar e editar notas no vault"): a nota vai para inbox/ com revisado: false.
  mcp.tool(
    'vault_criar_nota',
    'Cria uma nota no vault (vai para inbox/ com revisado: false)',
    {
      tipo: z.string().min(1).max(40).describe('Tipo da nota (reuniao, decisao, pessoa, atencao, conquista)'),
      titulo: z.string().min(1).max(200).describe('Título da nota'),
      conteudo: z.string().describe('Conteúdo em markdown'),
      fontes: z.array(z.string()).optional().describe('Fontes citadas'),
    },
    ({ tipo, titulo, conteudo, fontes }) =>
      audited(db, 'vault_criar_nota', { tipo, titulo, fontes }, () => {
        const policy = enforcePolicy(db, { tool: 'vault_criar_nota', level: 'sozinho', action: `Criar nota: "${titulo}"` });
        if (!policy.allowed) throw new Error('reason' in policy ? policy.reason : 'Aguardando aprovação');
        return `Nota criada: ${vaultCriarNota({ tipo, titulo, conteudo, fontes })}`;
      }),
  );

  mcp.tool(
    'discord_postar',
    'Posta uma mensagem em um canal do Discord do servidor privado do Paulo',
    {
      canal: z.enum(['briefing', 'alertas', 'aprovacoes', 'reunioes', 'pessoas', 'cto']).describe('Canal de destino'),
      texto: z.string().min(1).max(2000).describe('Mensagem (máx 2000 caracteres)'),
    },
    ({ canal, texto }) =>
      audited(db, 'discord_postar', { canal }, async () => {
        const policy = enforcePolicy(db, { tool: 'discord_postar', level: 'sozinho', action: `Postar em #${canal}` });
        if (!policy.allowed) throw new Error('reason' in policy ? policy.reason : 'Aguardando aprovação');
        const result = await discordPostar(canal, texto);
        return `Mensagem enviada (ID: ${result.messageId})`;
      }),
  );

  return mcp;
}

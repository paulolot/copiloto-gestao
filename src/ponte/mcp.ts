/**
 * T0.3 — MCP tool definitions
 * Exposes: ping, vault_*, discord_postar, boards_* and metricas_time (phase 1)
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
import { boardsAlertas, boardsItensProblema, boardsSaude, boardsSincronizar, metricasTime, type BoardsDeps } from './tools/boards.js';
import { tarefaConcluir, tarefaCriar, tarefaListar } from './tools/tarefas.js';
import { conquistaRegistrar } from './tools/conquistas.js';
import { TIPOS_PROBLEMA } from './azure/alertas.js';

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

export function createMcpServer(db: Database, deps: Omit<BoardsDeps, 'db'> = {}): McpServer {
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

  // Fase 1 — boards (leitura do Azure DevOps; nível `sozinho`, nada é escrito no Azure DevOps)
  const time = z.string().optional().describe('Time: fiscal, desktop ou retaguarda (padrão: todos os ativos)');

  mcp.tool(
    'boards_sincronizar',
    'Atualiza os dados do Azure DevOps (work items, sprints, commits, PRs) dos times ativos',
    { time },
    ({ time }) => audited(db, 'boards_sincronizar', { time }, () => boardsSincronizar({ db, ...deps }, time)),
  );

  mcp.tool(
    'boards_saude',
    'Saúde dos boards por time: métricas e sinais ativos com a data em que surgiram (nunca por pessoa)',
    { time },
    ({ time }) => audited(db, 'boards_saude', { time }, () => boardsSaude(db, time)),
  );

  mcp.tool(
    'boards_alertas',
    'Sinais de alerta ativos por time, com a data do primeiro sinal',
    { time },
    ({ time }) => audited(db, 'boards_alertas', { time }, () => boardsAlertas(db, time)),
  );

  mcp.tool(
    'boards_itens_problema',
    'Work items parados, bloqueados, sem dono ou sem estimativa de um time',
    { time: z.string().describe('Time: fiscal, desktop ou retaguarda'), tipo: z.enum(TIPOS_PROBLEMA as [string, ...string[]]) },
    ({ time, tipo }) => audited(db, 'boards_itens_problema', { time, tipo }, () => boardsItensProblema(db, time, tipo as (typeof TIPOS_PROBLEMA)[number])),
  );

  mcp.tool(
    'metricas_time',
    'Métricas de um time: atuais, ou o histórico guardado por semana e por sprint',
    { time: z.string().describe('Time: fiscal, desktop ou retaguarda'), periodo: z.enum(['atual', 'historico']).default('atual') },
    ({ time, periodo }) => audited(db, 'metricas_time', { time, periodo }, () => metricasTime(db, time, periodo)),
  );

  // Fase 1 — tarefas do Paulo (lista interna, nível `sozinho`)
  mcp.tool(
    'tarefa_criar',
    'Cria uma tarefa na lista do Paulo, com prioridade, origem (para citar a fonte) e prazo',
    {
      titulo: z.string().min(1).max(300),
      prioridade: z.enum(['alta', 'media', 'baixa']).default('media'),
      origem: z.string().max(300).optional().describe('De onde veio: work item, e-mail, reunião...'),
      prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('AAAA-MM-DD'),
    },
    ({ titulo, prioridade, origem, prazo }) =>
      audited(db, 'tarefa_criar', { titulo, prioridade, origem, prazo }, () => `Tarefa #${tarefaCriar(db, { titulo, prioridade, origem, prazo })} criada`),
  );

  mcp.tool(
    'tarefa_listar',
    'Lista as tarefas abertas do Paulo por prioridade e prazo',
    { incluirFeitas: z.boolean().default(false) },
    ({ incluirFeitas }) => audited(db, 'tarefa_listar', { incluirFeitas }, () => JSON.stringify(tarefaListar(db, { incluirFeitas }), null, 2)),
  );

  mcp.tool(
    'tarefa_concluir',
    'Marca uma tarefa como feita',
    { id: z.number().int().positive() },
    ({ id }) => audited(db, 'tarefa_concluir', { id }, () => `Tarefa #${tarefaConcluir(db, id).id} concluída`),
  );

  // Fase 1 — conquistas (RF-27): nota em inbox/, nível `sozinho`
  mcp.tool(
    'conquista_registrar',
    'Registra uma conquista do Paulo ou do time no vault (inbox/, revisado: false), com crédito ao time e fonte',
    {
      titulo: z.string().min(1).max(200),
      descricao: z.string().min(1).describe('O que aconteceu, com números quando houver'),
      times: z.array(z.string()).default([]).describe('Times a creditar'),
      fontes: z.array(z.string()).min(1).describe('Fontes: work items, commits, notas'),
    },
    ({ titulo, descricao, times, fontes }) =>
      audited(db, 'conquista_registrar', { titulo, times, fontes }, () => `Conquista registrada: ${conquistaRegistrar({ titulo, descricao, times, fontes })}`),
  );

  return mcp;
}

/**
 * T0.3 — MCP tool definitions
 * Exposes: ping, vault_*, discord_postar, boards_*, metricas_time, mensagem_propor and aprovacao_consultar (phase 1)
 *
 * Every call goes through `audited`, so no tool can forget to write the audit log.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Database } from 'sql.js';
import { logAudit } from './db/audit.js';
import { enforcePolicy } from './middleware/autonomy.js';
import type { IndiceVault, ResultadoSemantico } from './vault/indice.js';
import { umAUmPendentes } from './tools/um-a-um.js';
import { ctoPautaDados, ctoPautaSalvar, decisaoCtoAtualizar, decisaoCtoListar, decisaoCtoRegistrar, pontoAtencaoAtualizar, pontoAtencaoCandidatos, pontoAtencaoListar, pontoAtencaoRegistrar, STATUS_ITEM } from './tools/cto.js';
import { umAUmPreparar, umAUmRegistrar, umAUmSalvarPauta } from './tools/pauta-1x1.js';
import { pdiAtualizar, pdiAtrasados, pdiCompartilhar, pdiLer, STATUS_ACAO } from './tools/pdi.js';
import { CANAIS_MENSAGEM as CANAIS_PDI } from './tools/mensagens.js';
import { papelLer } from './tools/papeis.js';
import { pessoaPerfil } from './tools/pessoa-perfil.js';
import { vaultListar, vaultLer, vaultBuscar, vaultCriarNota, pessoaRegistrar, pessoaListar, pessoaLer, TIPOS_REGISTRO_PESSOA } from './tools/vault.js';
import { CANAIS_CONVERSA, discordLerNovas, discordMarcarLido, discordPostar, type DiscordCanal } from './tools/discord.js';
import { boardsMarcoDefinir, boardsMarcos, boardsTags, metricasColaborador, boardsAlertas, boardsItensProblema, boardsSaude, boardsSincronizar, metricasTime, type BoardsDeps } from './tools/boards.js';
import { tarefaConcluir, tarefaCriar, tarefaListar } from './tools/tarefas.js';
import { mensagemTarefasAbertas } from './discord/tarefas.js';
import { CAMPOS_REUNIAO, DIAS_SEMANA, FREQUENCIAS, reuniaoRecorrenteAjustar, reuniaoRecorrenteCadastrar, reuniaoRecorrenteHoje, reuniaoRecorrenteListar, reuniaoRecorrenteMarcarPreparada, reuniaoRecorrenteRemover } from './tools/reunioes-recorrentes.js';
import { conquistaRegistrar } from './tools/conquistas.js';
import { CANAIS_MENSAGEM, MAX_TEXTO, aprovacaoConsultar, mensagemPropor } from './tools/mensagens.js';
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

export type McpDeps = Omit<BoardsDeps, 'db'> & { indice?: IndiceVault; postar?: (canal: DiscordCanal, texto: string) => Promise<unknown> };

const formatarSemantico = (r: ResultadoSemantico[]) =>
  r.map((x) => `**${x.caminho}** (${x.pontuacao}${x.data ? `, ${x.data}` : ''})\n${x.trecho}`).join('\n\n---\n\n') || 'Nenhum resultado.';

export function createMcpServer(db: Database, deps: McpDeps = {}): McpServer {
  const indice = () => {
    if (!deps.indice) throw new Error('Busca por significado não configurada (defina EMBEDDER=local no .env e instale o modelo; veja docs/conectar.md)');
    return deps.indice;
  };
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

  mcp.tool(
    'vault_buscar_semantico',
    'Busca por significado nas notas revisadas (revisado: true); área restrita excluída. Filtros por time, pessoa e data do frontmatter. Cite o caminho e o trecho na resposta',
    {
      texto: z.string().min(1).describe('O que procurar, em linguagem natural'),
      time: z.string().optional(),
      pessoa: z.string().optional().describe('Pessoa citada no campo pessoas da nota'),
      desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limite: z.number().int().min(1).max(20).optional(),
    },
    (a) => audited(db, 'vault_buscar_semantico', { ...a }, async () => formatarSemantico(await indice().buscar('principal', a.texto, a))),
  );

  mcp.tool(
    'papel_ler',
    'Lê o plano de um papel (Tech Lead, Scrum Master…): competências, expectativas por nível, trilha de crescimento e sinais de que a pessoa está pronta. Avisa se o plano não foi revisado ou está incompleto',
    { papel: z.string().min(2).max(80) },
    ({ papel }) => audited(db, 'papel_ler', { papel }, () => JSON.stringify(papelLer(papel), null, 2)),
  );

  // CTO meeting (T2.9): open area (cto/), level sozinho; nothing here is sent to the CTO
  const status = z.enum(STATUS_ITEM as [string, ...string[]]);
  const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const json = (v: unknown) => JSON.stringify(v, null, 2);

  mcp.tool(
    'ponto_atencao_registrar',
    'Registra um ponto de atenção para a reunião com o CTO (o que vi, desde quando, o que já fiz, o que pode acontecer, o que preciso). "Desde quando" vem de um sinal datado (campo sinal, formato time:chave de ponto_atencao_candidatos) ou de uma data. Nenhum ponto vai à pauta sem "o que já fiz"',
    {
      titulo: z.string().min(3).max(200), o_que_vi: z.string().min(3).max(4000),
      desde: dataIso.optional(), sinal: z.string().max(200).optional(),
      ja_fiz: z.string().max(4000).optional(), pode_acontecer: z.string().max(4000).optional(), preciso: z.string().max(4000).optional(),
      fontes: z.array(z.string().max(300)).optional(),
    },
    (a) => audited(db, 'ponto_atencao_registrar', { titulo: a.titulo, sinal: a.sinal }, () => json(pontoAtencaoRegistrar(db, a))),
  );

  mcp.tool(
    'ponto_atencao_atualizar',
    'Atualiza um ponto de atenção (id vem de ponto_atencao_listar): campos, status (aberto, resolvido, descartado) e resolução',
    {
      id: z.string().min(3).max(200), status: status.optional(), titulo: z.string().max(200).optional(), resolucao: z.string().max(4000).optional(), desde: dataIso.optional(),
      o_que_vi: z.string().max(4000).optional(), ja_fiz: z.string().max(4000).optional(), pode_acontecer: z.string().max(4000).optional(), preciso: z.string().max(4000).optional(),
    },
    ({ id, status: st, titulo, resolucao, desde, ...campos }) =>
      audited(db, 'ponto_atencao_atualizar', { id, status: st }, () => json(pontoAtencaoAtualizar({ id, status: st as never, titulo, resolucao, desde, campos }))),
  );

  mcp.tool(
    'ponto_atencao_listar',
    'Lista os pontos de atenção (padrão: abertos), dizendo quais estão prontos para a pauta e o que falta nos demais',
    { status: status.optional() },
    ({ status: st }) => audited(db, 'ponto_atencao_listar', { status: st }, () => json(pontoAtencaoListar(st as never))),
  );

  mcp.tool(
    'ponto_atencao_candidatos',
    'Sinais datados que podem virar ponto de atenção (o Paulo decide): amarelo há mais de 3 dias úteis, marco em risco, sinal vermelho, 1:1 atrasado e revisão de PDI vencida. Não registra nada',
    {},
    () => audited(db, 'ponto_atencao_candidatos', {}, () => json(pontoAtencaoCandidatos(db))),
  );

  mcp.tool(
    'decisao_cto_registrar',
    'Registra uma decisão que o Paulo precisa do CTO: problema, opções, recomendação e o que acontece se nada for decidido. Só vai à pauta completa',
    {
      titulo: z.string().min(3).max(200), problema: z.string().min(3).max(4000), opcoes: z.array(z.string().max(1000)).optional(),
      recomendacao: z.string().max(4000).optional(), se_nada: z.string().max(4000).optional(), fontes: z.array(z.string().max(300)).optional(),
    },
    (a) => audited(db, 'decisao_cto_registrar', { titulo: a.titulo }, () => json(decisaoCtoRegistrar(a))),
  );

  mcp.tool(
    'decisao_cto_atualizar',
    'Atualiza uma decisão pendente para o CTO (id vem de decisao_cto_listar): campos, status e resolução',
    {
      id: z.string().min(3).max(200), status: status.optional(), titulo: z.string().max(200).optional(), resolucao: z.string().max(4000).optional(),
      problema: z.string().max(4000).optional(), opcoes: z.string().max(4000).optional(), recomendacao: z.string().max(4000).optional(), se_nada: z.string().max(4000).optional(),
    },
    ({ id, status: st, titulo, resolucao, ...campos }) =>
      audited(db, 'decisao_cto_atualizar', { id, status: st }, () => json(decisaoCtoAtualizar({ id, status: st as never, titulo, resolucao, campos }))),
  );

  mcp.tool(
    'decisao_cto_listar',
    'Lista as decisões pendentes para o CTO (padrão: abertas), com o que falta em cada uma',
    { status: status.optional() },
    ({ status: st }) => audited(db, 'decisao_cto_listar', { status: st }, () => json(decisaoCtoListar(st as never))),
  );

  mcp.tool(
    'cto_pauta_dados',
    'Reúne os dados da pauta quinzenal do CTO: se a pauta está devida (a cada 15 dias), conquistas revisadas desde a última pauta (crédito ao time), decisões pendentes, pontos de atenção prontos (com "o que já fiz"), candidatos, sinais com data, marcos e percentis por time. Conquistas primeiro na pauta',
    { desde: dataIso.optional().describe('Padrão: data da última pauta, ou 15 dias atrás') },
    ({ desde }) => audited(db, 'cto_pauta_dados', { desde }, () => json(ctoPautaDados(db, { desde }))),
  );

  mcp.tool(
    'cto_pauta_salvar',
    'Grava a pauta do CTO em cto/AAAA-MM-DD-pauta.md (revisado: false). Informe os ids dos pontos e decisões que entraram: um ponto sem "o que já fiz" é recusado. Não envia nada ao CTO: relatório ou aviso só pela fila (mensagem_propor)',
    {
      texto: z.string().min(1).max(30000), fontes: z.array(z.string().max(300)).min(1),
      pontos_incluidos: z.array(z.string().max(200)), decisoes_incluidas: z.array(z.string().max(200)).optional(),
    },
    (a) => audited(db, 'cto_pauta_salvar', { pontos: a.pontos_incluidos, decisoes: a.decisoes_incluidas }, () => `Pauta salva em ${ctoPautaSalvar(a)}. Poste no #cto e avise o Paulo; nada foi enviado ao CTO.`),
  );

  mcp.tool(
    'vault_reindexar',
    'Atualiza o índice da busca por significado (só o que mudou) ou, com total, reconstrói tudo a partir das notas',
    { total: z.boolean().optional() },
    ({ total }) => audited(db, 'vault_reindexar', { total }, async () => JSON.stringify(await indice().sincronizar(total), null, 2)),
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
      canal: z.enum(['briefing', 'alertas', 'aprovacoes', 'reunioes', 'pessoas', 'cto', 'planejamento', 'insights', 'cobrancas']).describe('Canal de destino'),
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
    'Atualiza os dados do Azure DevOps (work items, commits, PRs) dos times ativos',
    { time },
    ({ time }) => audited(db, 'boards_sincronizar', { time }, () => boardsSincronizar({ db, ...deps }, time)),
  );

  mcp.tool(
    'boards_saude',
    'Saúde dos boards por time: métricas e sinais ativos com a data em que surgiram, e quem está com WIP acima do limite',
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

  // Marcos de entrega (os times não usam sprints): uma data + os work items marcados por uma tag
  mcp.tool(
    'marco_definir',
    'Cria ou muda um marco de entrega e as regras dele, quando o Paulo quiser, por time. Só com regras = próximo marco planejado (sem tag nem data); com tag e data o marco passa a ser acompanhado. Uma data posterior conta como adiamento. Lista interna do Paulo, nível sozinho: depois de usar, repita ao Paulo o que ficou registrado',
    {
      id: z.number().int().positive().optional().describe('Marco existente; sem ele, usa o marco da mesma tag ou o planejado do mesmo time, ou cria um'),
      nome: z.string().min(1).max(200).optional(),
      time: z.string().optional().describe('Time do marco: fiscal, desktop ou retaguarda; sem ele vale para todos os times ativos'),
      tag: z.string().min(1).max(100).optional().describe('Tag dos work items do marco (maiúsculas e acentos não importam)'),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Data de entrega, AAAA-MM-DD'),
      confianca: z.number().int().min(50).max(99).optional().describe('Percentil de confiança exigido da previsão (padrão 85)'),
      janelaSemanas: z.number().int().min(4).max(52).optional().describe('Semanas de histórico usadas na previsão (padrão 12)'),
      tipos: z.array(z.string()).optional().describe('Tipos de item contados (padrão: User Story e Bug)'),
      escopoFechado: z.boolean().optional().describe('Avisar se entrarem itens depois do registro'),
      observacao: z.string().max(1000).optional().describe('Outras regras, em texto livre'),
      estado: z.enum(['ativo', 'entregue', 'cancelado']).optional(),
    },
    (args) => audited(db, 'marco_definir', args, () => boardsMarcoDefinir(db, args)),
  );

  mcp.tool(
    'boards_marcos',
    'Andamento dos marcos de entrega: itens entregues, em andamento, aguardando release, paralisados e parados, dias até a data, adiamentos e risco estimado',
    { id: z.number().int().positive().optional().describe('Um marco específico'), incluirEncerrados: z.boolean().default(false) },
    ({ id, incluirEncerrados }) => audited(db, 'boards_marcos', { id, incluirEncerrados }, () => boardsMarcos(db, { id, incluirEncerrados })),
  );

  mcp.tool(
    'boards_tags',
    'Tags em uso nos work items abertos e quantos itens cada uma tem; ajuda a achar a tag de um marco',
    { time },
    ({ time }) => audited(db, 'boards_tags', { time }, () => boardsTags(db, time)),
  );

  mcp.tool(
    'metricas_time',
    'Métricas de um time: atuais, ou o histórico guardado por semana e por mês',
    { time: z.string().describe('Time: fiscal, desktop ou retaguarda'), periodo: z.enum(['atual', 'historico']).default('atual') },
    ({ time, periodo }) => audited(db, 'metricas_time', { time, periodo }, () => metricasTime(db, time, periodo)),
  );

  // Métricas por colaborador: área restrita. Ferramenta específica; o nome buscado não vai para o log.
  mcp.tool(
    'metricas_colaborador',
    'Métricas individuais de um colaborador (WIP, entregas, cycle time, itens parados e paralisados). Uso do Paulo em 1:1 e PDI, sem ranking',
    { pessoa: z.string().min(2).describe('Parte do nome ou e-mail do colaborador'), time: z.string().optional().describe('Limitar a um time') },
    ({ pessoa, time }) => audited(db, 'metricas_colaborador', { pessoa: '[restrito]', time }, () => metricasColaborador(db, { pessoa, time })),
  );

  mcp.tool(
    'metricas_colaboradores',
    'Métricas individuais de todos os colaboradores de um time, em ordem alfabética (nunca ordenadas por desempenho). Dado restrito',
    { time },
    ({ time }) => audited(db, 'metricas_colaboradores', { time }, () => metricasColaborador(db, { time })),
  );

  // Fase 1 — tarefas do Paulo (lista interna, nível `sozinho`)
  mcp.tool(
    'tarefa_criar',
    'Cria uma tarefa na lista do Paulo, com prioridade, origem (para citar a fonte) e prazo. Para cobrar algo de alguém, informe cobrarDe (quem) e lembrarEm (quando lembrar o Paulo)',
    {
      titulo: z.string().min(1).max(300),
      prioridade: z.enum(['alta', 'media', 'baixa']).default('media'),
      origem: z.string().max(300).optional().describe('De onde veio: work item, e-mail, reunião, conversa...'),
      prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('AAAA-MM-DD'),
      cobrarDe: z.string().max(100).optional().describe('Pessoa que deve algo ao Paulo (tarefa de cobrança)'),
      lembrarEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('AAAA-MM-DD em que lembrar o Paulo de cobrar'),
    },
    ({ titulo, prioridade, origem, prazo, cobrarDe, lembrarEm }) =>
      audited(db, 'tarefa_criar', { titulo, prioridade, origem, prazo, cobrarDe, lembrarEm }, () => `Tarefa #${tarefaCriar(db, { titulo, prioridade, origem, prazo, cobrarDe, lembrarEm })} criada`),
  );

  mcp.tool(
    'tarefa_listar',
    'Lista as tarefas abertas do Paulo por prioridade e data. soCobrancas = só as de cobrar alguém; lembrarAte = só as que o lembrete ou o prazo vencem até aquele dia',
    {
      incluirFeitas: z.boolean().default(false),
      soCobrancas: z.boolean().default(false),
      lembrarAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('AAAA-MM-DD'),
    },
    ({ incluirFeitas, soCobrancas, lembrarAte }) =>
      audited(db, 'tarefa_listar', { incluirFeitas, soCobrancas, lembrarAte }, () => JSON.stringify(tarefaListar(db, { incluirFeitas, soCobrancas, lembrarAte }), null, 2)),
  );

  mcp.tool(
    'tarefa_concluir',
    'Marca uma tarefa como feita',
    { id: z.number().int().positive() },
    ({ id }) => audited(db, 'tarefa_concluir', { id }, () => `Tarefa #${tarefaConcluir(db, id).id} concluída`),
  );

  // Reuniões recorrentes (cadastro pelo Discord, #reunioes): lista interna, nível `sozinho`
  mcp.tool(
    'reuniao_recorrente_cadastrar',
    'Cadastra uma reunião recorrente do Paulo para o Copiloto preparar a pauta antes de cada ocorrência. O titulo é o do evento no Google Calendar',
    {
      titulo: z.string().min(1).max(200).describe('Título do evento no Google Calendar, exatamente como aparece'),
      dia: z.string().min(1).max(20).describe(`Dia da semana: ${DIAS_SEMANA.join(', ')}`),
      hora: z.string().min(1).max(10).describe('11:00, 11h ou 11h30'),
      assunto: z.string().min(1).max(500).describe('Para que serve a reunião e o que se discute nela'),
      frequencia: z.enum(FREQUENCIAS).default('semanal'),
      inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('AAAA-MM-DD de uma ocorrência; define as semanas de uma reunião quinzenal (padrão: a próxima)'),
      participantes: z.string().max(500).optional(),
      times: z.string().max(300).optional().describe('Times dos boards envolvidos (fiscal, desktop, retaguarda...)'),
      marco: z.string().max(300).optional().describe('Marco de entrega que a reunião acompanha, com a data'),
      fontes: z.string().max(1500).optional().describe('Planilhas, documentos e links que acompanham a reunião'),
      instrucoes: z.string().max(1500).optional().describe('Como o Paulo quer a pauta: o que priorizar ou evitar'),
    },
    (r) => audited(db, 'reuniao_recorrente_cadastrar', { titulo: r.titulo, dia: r.dia, hora: r.hora, frequencia: r.frequencia }, () => JSON.stringify(reuniaoRecorrenteCadastrar(db, r), null, 2)),
  );

  mcp.tool(
    'reuniao_recorrente_listar',
    'Lista as reuniões recorrentes cadastradas pelo Paulo, por dia e hora',
    {},
    () => audited(db, 'reuniao_recorrente_listar', {}, () => JSON.stringify(reuniaoRecorrenteListar(db), null, 2)),
  );

  mcp.tool(
    'reuniao_recorrente_hoje',
    'Reuniões recorrentes que acontecem hoje (ou na data informada) e ainda não foram preparadas. Com incluirPreparadas devolve também as já preparadas. Prepare cada uma e chame reuniao_recorrente_marcar_preparada',
    {
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('AAAA-MM-DD (padrão: hoje, horário de São Paulo)'),
      incluirPreparadas: z.boolean().default(false),
    },
    ({ data, incluirPreparadas }) => audited(db, 'reuniao_recorrente_hoje', { data, incluirPreparadas }, () => JSON.stringify(reuniaoRecorrenteHoje(db, { data, incluirPreparadas }), null, 2)),
  );

  mcp.tool(
    'reuniao_recorrente_ajustar',
    `Muda um campo de uma reunião recorrente (${CAMPOS_REUNIAO.join(', ')}). Para limpar um campo opcional, mande valor vazio (no Discord o comando usa "-")`,
    { id: z.number().int().positive(), campo: z.enum(CAMPOS_REUNIAO), valor: z.string().max(1500) },
    ({ id, campo, valor }) => audited(db, 'reuniao_recorrente_ajustar', { id, campo }, () => JSON.stringify(reuniaoRecorrenteAjustar(db, id, campo, valor), null, 2)),
  );

  mcp.tool(
    'reuniao_recorrente_remover',
    'Remove uma reunião recorrente do cadastro (só quando o Paulo pedir)',
    { id: z.number().int().positive() },
    ({ id }) => audited(db, 'reuniao_recorrente_remover', { id }, () => `Reunião #${id} removida: ${reuniaoRecorrenteRemover(db, id).titulo}`),
  );

  mcp.tool(
    'reuniao_recorrente_marcar_preparada',
    'Marca a reunião como preparada na data (padrão: hoje), para não ser preparada duas vezes. Chame só depois de postar a pauta',
    { id: z.number().int().positive(), data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() },
    ({ id, data }) => audited(db, 'reuniao_recorrente_marcar_preparada', { id, data }, () => { const r = reuniaoRecorrenteMarcarPreparada(db, id, data); return `Reunião #${r.id} preparada em ${r.preparadaEm}`; }),
  );

  mcp.tool(
    'tarefas_postar',
    'Posta no Discord a lista de tarefas abertas com um botão "feita" por tarefa (só o Paulo consegue clicar)',
    { canal: z.enum(['briefing', 'alertas']).default('briefing') },
    ({ canal }) =>
      audited(db, 'tarefas_postar', { canal }, async () => {
        const policy = enforcePolicy(db, { tool: 'tarefas_postar', level: 'sozinho', action: `Postar tarefas em #${canal}` });
        if (!policy.allowed) throw new Error('reason' in policy ? policy.reason : 'Aguardando aprovação');
        const m = mensagemTarefasAbertas(db);
        const r = await discordPostar(canal, m.content, m.components.map((c) => c.toJSON()));
        return `Tarefas postadas (ID: ${r.messageId})`;
      }),
  );

  // Área restrita (pessoas/): ferramentas específicas; o texto nunca vai para o log, só o caminho da nota
  const restrito = async (tool: string, params: Record<string, unknown>, body: () => { texto: string; caminho?: string }): Promise<ToolResult> => {
    const inicio = Date.now();
    try {
      const r = body();
      logAudit(db, { tool, params, origin: 'mcp', result: 'ok', duration_ms: Date.now() - inicio, restricted_path: r.caminho });
      return text(r.texto);
    } catch (e) {
      logAudit(db, { tool, params, origin: 'mcp', result: 'error', error_msg: (e as Error).message, duration_ms: Date.now() - inicio });
      return text(`Erro: ${(e as Error).message}`, true);
    }
  };

  mcp.tool(
    'pessoa_registrar',
    'Registra na área restrita do vault (pessoas/<nome>/) uma impressão, conversa privada, feedback ou combinado sobre uma pessoa. Nível sozinho. Não repita o conteúdo em canal do Discord: confirme só o caminho',
    {
      pessoa: z.string().min(2).max(100),
      tipo: z.enum(TIPOS_REGISTRO_PESSOA as [string, ...string[]]),
      texto: z.string().min(1).max(8000).describe('O que o Paulo quer registrar, com as palavras dele'),
      fonte: z.string().max(200).optional().describe('Ex.: conversa no #pessoas de 22/10'),
    },
    ({ pessoa, tipo, texto, fonte }) =>
      restrito('pessoa_registrar', { pessoa: '[restrito]', tipo }, () => {
        const caminho = pessoaRegistrar({ pessoa, tipo: tipo as (typeof TIPOS_REGISTRO_PESSOA)[number], texto, fonte });
        return { texto: `Registrado em ${caminho}`, caminho };
      }),
  );

  mcp.tool(
    'pessoa_listar',
    'Lista os caminhos das notas da área restrita sobre uma pessoa, da mais recente para a mais antiga (só caminhos)',
    { pessoa: z.string().min(2).max(100) },
    ({ pessoa }) => restrito('pessoa_listar', { pessoa: '[restrito]' }, () => ({ texto: pessoaListar(pessoa).join('\n') || 'Nenhuma nota.' })),
  );

  mcp.tool(
    'pessoa_perfil',
    'Junta, da área restrita, o perfil, o PDI, os últimos 1:1, os registros recentes, os sinais do board e as conquistas do time de uma pessoa. Devolve dados e caminhos, nunca opinião. Não repita o conteúdo em canal do Discord',
    { pessoa: z.string().min(2).max(100) },
    ({ pessoa }) => restrito('pessoa_perfil', { pessoa: '[restrito]' }, () => ({ texto: JSON.stringify(pessoaPerfil(db, pessoa), null, 2) })),
  );

  mcp.tool(
    'pessoa_buscar_semantico',
    'Busca por significado na área restrita (pessoas/: PDI, 1:1, registros). Use só quando a tarefa exige e nunca poste o conteúdo em canal compartilhado',
    {
      texto: z.string().min(1),
      pessoa: z.string().optional(),
      desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limite: z.number().int().min(1).max(20).optional(),
    },
    async (a) => {
      const inicio = Date.now();
      try {
        const r = await indice().buscar('restrito', a.texto, a);
        logAudit(db, { tool: 'pessoa_buscar_semantico', params: { pessoa: '[restrito]', texto: '[restrito]' }, origin: 'mcp', result: 'ok', duration_ms: Date.now() - inicio, restricted_path: r[0]?.caminho });
        return text(formatarSemantico(r));
      } catch (e) {
        logAudit(db, { tool: 'pessoa_buscar_semantico', params: { pessoa: '[restrito]', texto: '[restrito]' }, origin: 'mcp', result: 'error', error_msg: (e as Error).message, duration_ms: Date.now() - inicio });
        return text(`Erro: ${(e as Error).message}`, true);
      }
    },
  );

  mcp.tool(
    'um_a_um_pendentes',
    'Por pessoa: data do último 1:1, cadência esperada e dias de atraso; e revisões de PDI vencidas. Só nomes e números, em ordem alfabética, sem conteúdo de notas. Use no briefing (bloco "1:1 e PDI atrasados") e nunca para comparar pessoas',
    {},
    () => restrito('um_a_um_pendentes', {}, () => ({ texto: JSON.stringify(umAUmPendentes(), null, 2) })),
  );

  mcp.tool(
    'pdi_ler',
    'Lê o PDI de uma pessoa: objetivo, ações estruturadas (id, descrição, competência do plano do papel, prazo, status) e avisos (competência fora do plano, prazo vencido, revisão vencida, não revisado). Área restrita: não repita o conteúdo em canal do Discord',
    { pessoa: z.string().min(2).max(100) },
    ({ pessoa }) => restrito('pdi_ler', { pessoa: '[restrito]' }, () => { const p = pdiLer(pessoa); return { texto: JSON.stringify(p, null, 2), caminho: p.caminho }; }),
  );

  mcp.tool(
    'pdi_atualizar',
    'Cria o PDI de uma pessoa ou adiciona/atualiza uma ação, ou registra a revisão (próxima em 6 meses). Nível sozinho, área restrita. Tudo que você escreve fica revisado: false até o Paulo conferir. Nunca compartilha: para isso use pdi_compartilhar',
    {
      pessoa: z.string().min(2).max(100),
      acao: z.enum(['criar', 'adicionar', 'atualizar', 'revisar']),
      objetivo: z.string().max(2000).optional().describe('Só em criar'),
      id: z.string().max(10).optional().describe('Só em atualizar: id da ação, ex.: A2'),
      descricao: z.string().max(500).optional(),
      competencia: z.string().max(120).optional().describe('Nome exato de uma competência do plano do papel (papel_ler)'),
      prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      status: z.enum(STATUS_ACAO).optional(),
    },
    (a) => restrito('pdi_atualizar', { pessoa: '[restrito]', acao: a.acao }, () => {
      const op = a.acao === 'criar' ? { acao: 'criar' as const, objetivo: a.objetivo }
        : a.acao === 'revisar' ? { acao: 'revisar' as const }
        : a.acao === 'adicionar' ? { acao: 'adicionar' as const, descricao: a.descricao ?? '', competencia: a.competencia, prazo: a.prazo, status: a.status }
        : { acao: 'atualizar' as const, id: a.id ?? '', descricao: a.descricao, competencia: a.competencia, prazo: a.prazo, status: a.status };
      const t = pdiAtualizar(a.pessoa, op);
      return { texto: t, caminho: /(pessoas\/\S+\.md)/.exec(t)?.[1] };
    }),
  );

  mcp.tool(
    'pdi_atrasados',
    'Ações de PDI com prazo vencido (abertas ou em andamento) e revisões de PDI vencidas, por pessoa em ordem alfabética. Área restrita; use para o Coach e o 1:1, nunca para comparar pessoas',
    {},
    () => restrito('pdi_atrasados', {}, () => ({ texto: JSON.stringify(pdiAtrasados(), null, 2) })),
  );

  mcp.tool(
    'pdi_compartilhar',
    'Propõe compartilhar o PDI (objetivo e ações, sem as notas internas) com a própria pessoa. SEMPRE vai para a fila de aprovações: nada é enviado, o Paulo decide em #aprovacoes e copia o texto aprovado. Exige PDI com revisado: true',
    { pessoa: z.string().min(2).max(100), canal: z.enum(CANAIS_PDI).describe('Por onde o Paulo vai enviar') },
    ({ pessoa, canal }) =>
      audited(db, 'pdi_compartilhar_pedido', { pessoa: '[restrito]', canal }, () => {
        const id = pdiCompartilhar(db, pessoa, canal);
        return `Item #${id} na fila de aprovações. Nada foi enviado: aguarde o OK do Paulo em #aprovacoes (aprovacao_consultar com id ${id}).`;
      }),
  );

  mcp.tool(
    'um_a_um_preparar',
    'Reúne, para a pauta do próximo 1:1 com uma pessoa: andamento do PDI, combinados do último 1:1, sinais do board, registros desde o último 1:1, conquistas do time e temas sugeridos (fatos com fonte, sem opinião). Área restrita: não repita o conteúdo em canal do Discord. Depois escreva a pauta no tom do Paulo (skill de persona) e grave com um_a_um_salvar_pauta',
    { pessoa: z.string().min(2).max(100) },
    ({ pessoa }) => restrito('um_a_um_preparar', { pessoa: '[restrito]' }, () => ({ texto: JSON.stringify(umAUmPreparar(db, pessoa), null, 2) })),
  );

  mcp.tool(
    'um_a_um_salvar_pauta',
    'Grava a pauta de 1:1 que você escreveu em pessoas/<nome>/1x1/AAAA-MM-DD-pauta.md (área restrita, revisado: false) e avisa no #pessoas apenas "Pauta de 1:1 pronta em <caminho>". Nunca poste o texto da pauta no Discord. Cite as fontes',
    {
      pessoa: z.string().min(2).max(100),
      texto: z.string().min(1).max(20000).describe('A pauta, em português, no tom do Paulo'),
      fontes: z.array(z.string().max(300)).min(1).describe('Caminhos de notas, work items e sinais usados'),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Data do 1:1; padrão hoje'),
    },
    async ({ pessoa, texto: t, fontes, data }) => {
      const inicio = Date.now();
      try {
        const caminho = umAUmSalvarPauta(pessoa, { texto: t, fontes, data });
        let aviso = '';
        try { await (deps.postar ?? discordPostar)('pessoas', `Pauta de 1:1 pronta em ${caminho}`); }
        catch (e) { aviso = ` O aviso no #pessoas não foi enviado (${(e as Error).message}).`; }
        logAudit(db, { tool: 'um_a_um_salvar_pauta', params: { pessoa: '[restrito]' }, origin: 'mcp', result: 'ok', duration_ms: Date.now() - inicio, restricted_path: caminho });
        return text(`Pauta salva em ${caminho}.${aviso || ' Avisei no #pessoas só o caminho.'}`);
      } catch (e) {
        logAudit(db, { tool: 'um_a_um_salvar_pauta', params: { pessoa: '[restrito]' }, origin: 'mcp', result: 'error', error_msg: (e as Error).message, duration_ms: Date.now() - inicio });
        return text(`Erro: ${(e as Error).message}`, true);
      }
    },
  );

  mcp.tool(
    'um_a_um_registrar',
    'Registra um 1:1 que ACONTECEU em pessoas/<nome>/1x1/AAAA-MM-DD-1x1.md (temas, combinados e próximos passos), o que atualiza os lembretes de 1:1. Nível sozinho, área restrita, revisado: false. Registre só o que o Paulo contou, sem interpretar. Não repita o conteúdo em canal do Discord',
    {
      pessoa: z.string().min(2).max(100),
      temas: z.string().min(1).max(8000).describe('O que foi conversado, nas palavras do Paulo'),
      combinados: z.array(z.string().max(500)).optional().describe('O que ficou acordado, com responsável e prazo quando houver'),
      proximos_passos: z.array(z.string().max(500)).optional(),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Data do 1:1; padrão hoje'),
    },
    (a) => restrito('um_a_um_registrar', { pessoa: '[restrito]' }, () => {
      const caminho = umAUmRegistrar(a.pessoa, { temas: a.temas, combinados: a.combinados, proximos_passos: a.proximos_passos, data: a.data });
      return { texto: `1:1 registrado em ${caminho}`, caminho };
    }),
  );

  mcp.tool(
    'pessoa_ler',
    'Lê uma nota da área restrita (pessoas/). Use só quando a tarefa exige (1:1, PDI, preparação) e nunca poste o conteúdo em canal compartilhado',
    { caminho: z.string().describe('Caminho dentro de pessoas/') },
    ({ caminho }) => restrito('pessoa_ler', { caminho: '[restrito]' }, () => ({ texto: pessoaLer(caminho), caminho })),
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

  // Conversa com o Paulo no Discord (#planejamento): só as mensagens dele são lidas
  mcp.tool(
    'discord_ler_novas',
    'Lê as mensagens novas do Paulo num canal de conversa (#planejamento, #insights, #pessoas, #cobrancas ou #reunioes); mensagens de outras pessoas e de bots são ignoradas. Depois de tratar, chame discord_marcar_lido com ateId',
    { canal: z.enum(CANAIS_CONVERSA).default('planejamento') },
    ({ canal }) =>
      audited(db, 'discord_ler_novas', { canal }, async () => {
        const ownerId = process.env.DISCORD_OWNER_ID;
        if (!ownerId) throw new Error('DISCORD_OWNER_ID não configurado');
        const r = await discordLerNovas(db, canal, ownerId);
        return JSON.stringify({
          ...r,
          ...(r.semConteudo ? { aviso: 'Há mensagens do Paulo com o texto vazio: ative o "Message Content Intent" do bot no Discord Developer Portal, ou peça a ele para mencionar o bot (@) na mensagem.' } : {}),
        }, null, 2);
      }),
  );

  mcp.tool(
    'discord_marcar_lido',
    'Marca as mensagens do canal de conversa como tratadas, até o id informado (ateId, devolvido por discord_ler_novas)',
    { canal: z.enum(CANAIS_CONVERSA).default('planejamento'), ateId: z.string().regex(/^\d+$/) },
    ({ canal, ateId }) => audited(db, 'discord_marcar_lido', { canal, ateId }, () => { discordMarcarLido(db, canal, ateId); return 'ok'; }),
  );

  // Texto para outra pessoa: nível pede_ok. Nada é enviado; vai para a fila e o Paulo decide em #aprovacoes.
  mcp.tool(
    'mensagem_propor',
    'Propõe uma mensagem, e-mail ou resposta para OUTRA PESSOA. Nada é enviado: o texto entra na fila de aprovações e o Paulo decide (aprova, edita ou recusa) em #aprovacoes. Use sempre que um texto em nome do Paulo chegar a alguém, depois de aplicar a persona. Devolve o número do item; consulte o resultado com aprovacao_consultar',
    {
      destinatario: z.string().min(1).max(200).describe('Quem vai receber (nome, grupo ou canal)'),
      canal: z.enum(CANAIS_MENSAGEM).describe('Por onde o Paulo vai enviar'),
      texto: z.string().min(1).max(MAX_TEXTO).describe('Texto final, já na voz do Paulo'),
      motivo: z.string().min(1).max(500).describe('Por que esta mensagem precisa sair agora'),
      fontes: z.array(z.string()).optional().describe('Fontes citadas (work item, nota do vault, e-mail, reunião)'),
    },
    ({ destinatario, canal, texto, motivo, fontes }) =>
      audited(db, 'mensagem_propor', { destinatario, canal }, () => {
        const id = mensagemPropor(db, { destinatario, canal, texto, motivo, fontes });
        return `Item #${id} na fila de aprovações. Nada foi enviado: aguarde o OK do Paulo em #aprovacoes (aprovacao_consultar com id ${id}).`;
      }),
  );

  mcp.tool(
    'aprovacao_consultar',
    'Consulta um item da fila de aprovações: se o Paulo já decidiu e qual é o texto final (o editado, se ele editou). Só leitura',
    { id: z.number().int().positive().describe('Número do item, devolvido por mensagem_propor') },
    ({ id }) => audited(db, 'aprovacao_consultar', { id }, () => JSON.stringify(aprovacaoConsultar(db, id), null, 2)),
  );

  return mcp;
}

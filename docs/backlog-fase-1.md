# Backlog — Fase 1: Boards e rotina

**Objetivo:** a ponte lê o Azure DevOps (somente leitura), calcula as métricas por time e alimenta o briefing diário e o resumo semanal.
**Requisitos:** RF-01 a RF-11, RF-27 (e RF-36 como consequência das ferramentas de consulta).

**Gate de saída:** briefing útil em 4 de 5 dias por 2 semanas, com alertas de board e de métricas vindos da ponte.

Legenda: **[código]** pode ser feito numa sessão na nuvem · **[Paulo]** depende do Paulo (ver `checklist-paulo.md`) · **[máquina]** precisa da máquina do Paulo.

Premissas: o Azure DevOps é acessado só por leitura com PAT; Squad Fiscal primeiro, os outros dois times já configurados mas ligados por variável de ambiente. Respostas do Paulo (21/10/2026): os três times estão no projeto Metanet (área `Metanet\Squad Desktop` incluída); bloqueio = campo Paralisado (`Custom.Status`, com texto); campo **Tipo Bug** = "Bug Interno" ou "Bug Externo" (os dois contam em bug rate e MTTR); colunas do board em `docs/plano.md` (Ideias e UX fora de tudo; lead time de *Backlog* a *Concluído*; cycle time de *Fazendo Análise* a *Pronto pra release*; Squad Fiscal sem *Release candidate*). Nome técnico do campo Tipo Bug confirmado (`Custom.TipoBug`). Os times não usam sprints; roadmaps são combinados em conversa e, às vezes, marcados por uma tag.

## Tarefas

- [x] **T1.1 Cliente do Azure DevOps** [código]
  - `src/ponte/azure/client.ts`: somente GET/POST de leitura (WIQL), autenticação Basic com PAT (`AZDO_PAT`), organização `AZDO_ORG`; `fetch` injetável; paginação em lotes de 200 ids; tempo limite e erro sem vazar o token.
  - Escopo dos times em `src/ponte/azure/escopo.ts` (area path, projeto, repositórios), conforme `plano.md`.
  - Pronto quando: testes com respostas simuladas (`tests/fixtures/azdo/`) cobrem work items, iterações, commits e PRs, e provam que o token não aparece em erros nem no log.

- [x] **T1.2 Sincronização dos boards** [código] — depende de T1.1 (RF-01, RF-02)
  - Tabelas no SQLite: work items (sem expor nome de pessoa), iterações, commits por dia e repositório, pull requests.
  - Sincronização incremental (primeira carga: 12 semanas + tudo que está aberto).
  - Pronto quando: teste prova carga inicial, carga incremental e idempotência.

- [x] **T1.3 Métricas por time** [código] — depende de T1.2 (RF-03, RF-06)
  - Itens envelhecendo, bloqueados, WIP por coluna e por pessoa (só agregado), cycle e lead time, throughput, bugs abertos/escapados, bug rate, MTTR, frequência de commit por repositório.
  - Histórico em `metric_snapshots` (por semana e por mês; os times não usam sprints, ver T1.10f).
  - Pronto quando: testes com fixture conferem cada métrica e provam que nenhuma saída traz nome de pessoa.

- [x] **T1.4 Alertas e itens-problema** [código] — depende de T1.3 (RF-04, RF-05)
  - Limites padrão do `plano.md`; sem limite, desvio contra a linha de base das últimas 8 semanas.
  - Itens parados, bloqueados, sem dono e sem estimativa.
  - Tabela `sinais` guarda a data em que cada sinal surgiu (alimenta os pontos de atenção do CTO).
  - Pronto quando: testes cobrem cada alerta, a linha de base e a data do primeiro sinal.

- [x] **T1.5 Ferramentas MCP de boards** [código] — depende de T1.4
  - `boards_sincronizar`, `boards_saude(time?)`, `boards_alertas(time?)`, `boards_itens_problema(time, tipo)`, `boards_gargalos(time?, limite_dias_uteis?, tipos?, top?, incluir_backlog?)`, `metricas_time(time, periodo)`; nível `sozinho` (leitura), todas pelo log de auditoria.
  - Pronto quando: cliente MCP de teste chama cada uma e o log registra.

- [x] **T1.6 Sincronização agendada e alertas no Discord** [código] — depende de T1.4 (RNF-01)
  - A cada hora, dias úteis, 7h às 17h; sinal novo vai para `#alertas`; falha de sincronização também avisa.
  - Pronto quando: teste do agendador (relógio simulado) e da postagem só de sinais novos.

- [x] **T1.7 Tarefas do Paulo** [código] (RF-08)
  - `tarefa_criar`, `tarefa_listar`, `tarefa_concluir` (prioridade, origem, prazo); nível `sozinho` (lista interna).
  - Pronto quando: testes cobrem ciclo completo. Marcar como feita por botão no Discord fica para o Paulo validar junto com T1.11.

- [x] **T1.8 Registro de conquistas** [código] (RF-27)
  - `conquista_registrar(titulo, descricao, times, fontes)` cria nota `tipo: conquista` em `inbox/`, com crédito ao time.
  - Pronto quando: teste confirma a nota e o frontmatter.

- [x] **T1.9 Rotinas do Grok Bot** [código] (RF-07, RF-09, RF-10, RF-11)
  - `grok/rotinas/briefing-diario.md` (7h30), `resumo-semanal.md` (sexta), `observador-boards.md` (hora em hora).
  - Pronto quando: textos prontos para colar, citando fontes e sem ranking individual.

- [x] **T1.10 Documentação** [código]
  - `docs/conectar.md` com as variáveis do Azure DevOps; `.env.example` atualizado; checklist do Paulo.

- [x] **T1.10b Campos Paralisado e Tipo Bug** [código]
  - Leitura dos campos personalizados (nomes técnicos em `AZDO_CAMPO_PARALISADO` e `AZDO_CAMPO_TIPO_BUG`, padrão `Custom.Paralisado` e `Custom.TipoBug`); a tag `Blocked`/`Bloqueado` continua valendo junto.
  - Pronto quando: testes cobrem os dois campos e a migração do banco.

- [x] **T1.10c Métricas por colaborador** [código] (pedido do Paulo em 21/10/2026, altera RF-06)
  - `metricas_colaborador(pessoa, time?)` e `metricas_colaboradores(time?)`: WIP, itens abertos, parados, paralisados, bugs, entregas das últimas 8 semanas, cycle e lead time. Ordem alfabética, sem ranking; nome buscado fora do log de auditoria.
  - Limite conhecido: a entrega conta para o dono atual do item (histórico de reatribuição não é lido). Commits por pessoa ficam de fora (o plano os mede por repositório).
  - Pronto quando: testes provam os números, a ausência de campo de ranking e o aviso de uso.

- [x] **T1.10d Botão "feita" no Discord** [código] (RF-08)
  - `tarefas_postar` posta as tarefas abertas com um botão por tarefa; só o Paulo clica; a mensagem é refeita a cada clique (tarefa riscada, botão removido); o clique vai para o log.
  - Pronto quando: testes com interação simulada cobrem conclusão, usuário não autorizado e tarefa já concluída. Validação real: checklist do Paulo.

- [x] **T1.10e Colunas do board e cycle time** [código]
  - `src/ponte/azure/colunas.ts` guarda a ordem das colunas (nomes comparados sem maiúsculas, acentos e espaços extras); `Ideias` e `UX` ficam fora de toda métrica (`AZDO_COLUNAS_IGNORADAS`); WIP = *Fazendo Análise* até *Aguardando pipeline*; entregue = *Concluído*.
  - Lead time: *Backlog* → *Concluído*. Cycle time: *Fazendo Análise* → primeira chegada a *Pronto pra release* ou depois (ou estado Resolved).
  - Essas datas vêm das revisões do item, buscadas uma vez por item que chegou a Resolved ou Closed (até 300 por sincronização; falha de um item não derruba a sincronização). Sem a revisão, usa criação, ativação e a data da mudança de estado.
  - Bug rate e MTTR passam a contar Bug Interno e Externo.
  - Pronto quando: testes cobrem as colunas, Ideias fora, cycle time pelas revisões e Bug Interno.

- [x] **T1.10f Sem sprints: janelas mensais e marcos de entrega** [código] (resposta do Paulo, 21/10/2026)
  - Saem as métricas e alertas de sprint (compromisso, escopo adicionado) e a leitura de iterações do Azure DevOps. Tendências passam a ser por semana (throughput, commits) e por mês (cycle e lead time, bug rate = bugs criados ÷ User Stories resolvidas (decisão de 22/10/2026; janelas móveis de 7, 30 e 90 dias no briefing), MTTR = Backlog→Concluído dos bugs entregues); alertas de "2 sprints" viram "2 meses seguidos".
  - Marco de entrega = uma data + os work items marcados por uma tag arbitrária (ver T1.10g).
  - Só User Story e Bug entram nas métricas (Feature, Épico, Atendimento e Task ficam fora; `AZDO_TIPOS`).
  - Pronto quando: testes cobrem os meses, os alertas mensais, os marcos (risco, adiamentos, sinal) e o filtro de tipos.

- [x] **T1.10g Marcos com regras, previsão por percentis e registro por conversa** [código] (pedido do Paulo, 22/10/2026)
  - `marco_definir`: cria ou muda um marco e as regras dele a qualquer momento, por time; só com regras fica "planejado" (próximo marco), com tag e data passa a "ativo"; data posterior conta adiamento. Regras: confiança (percentil, padrão 85), janela de histórico (padrão 12 semanas), tipos, escopo fechado e observação livre.
  - Previsão por Monte Carlo (`azure/previsao.ts`) sobre a vazão semanal real, com gerador de números com semente (mesma resposta no mesmo dia): chance de entregar até a data e datas P50/P85/P95. O risco compara a chance com a confiança da regra; fim das médias.
  - Cycle e lead time em P50/P85/P95 (12 semanas) e por mês; taxa de falha de mudança (aproximação do DORA).
  - `discord_ler_novas` / `discord_marcar_lido`: leitura do `#planejamento`, só das mensagens do Paulo (as de outras pessoas e de bots são ignoradas), com cursor que só avança quando o Grok Bot confirma. Rotina `grok/rotinas/planejamento.md`.
  - Pronto quando: testes cobrem percentis, previsão determinística, regras, estados, leitura do canal (dono, cursor, intent) e sinais.

- [x] **T1.10h Canais de captura, comandos `/` e roteiro das rotinas** [código] (pedido do Paulo, 22/10/2026)
  - Canais de entrada `#insights`, `#pessoas` (sigilo) e `#cobrancas`, além do `#planejamento`; `discord_ler_novas` lê os quatro, com um cursor por canal.
  - Ferramentas da área restrita `pessoa_registrar` / `pessoa_listar` / `pessoa_ler`: o texto nunca vai para o log nem é repetido no Discord, só o caminho da nota.
  - Tarefas de cobrança (`cobrarDe`, `lembrarEm`); o briefing lista as cobranças do dia.
  - Comandos `/tarefa`, `/tarefas`, `/marcos`, `/cobrar`, `/insight`, `/pessoa`, `/ajuda`: só o Paulo, cada um nos seus canais, respondem na hora.
  - Texto de ajuda e tópico de cada canal (até 1024 caracteres) numa fonte única; `docs/discord-canais.md` é gerado e um teste falha se estiver desatualizado.
  - `grok/rotinas/README.md` (roteiro único de todas as rotinas e skills, com horários) e `docs/discord-configuracao.md` (permissões em inglês e português).
  - Pronto quando: testes cobrem os comandos, a área restrita, a leitura dos canais e os limites do Discord.

- [x] **T1.10i Mensagens para outras pessoas pela fila de aprovações** [código] ✅ 22/10/2026 (RF-28, regra 9 da persona)
  - `mensagem_propor(destinatario, canal, texto, motivo, fontes)`: nível `pede_ok`; só enfileira, nada é enviado. O log de auditoria guarda destinatário e canal, nunca o texto.
  - `aprovacao_consultar(id)`: devolve estado e texto final (o editado, se o Paulo editou); recusado ou pendente não devolve texto.
  - A mensagem em `#aprovacoes` passa a mostrar para quem, o motivo e até 1300 caracteres do texto; o texto inteiro está no botão Editar.
  - Sem handler de envio: aprovado fica `aprovado` e o Paulo copia o texto. O envio automático é uma tarefa futura.
  - Pronto quando: testes cobrem a fila, a validação, o log sem o texto, o executor sem aprovação, a consulta por estado e a mensagem no Discord.

- [ ] **T1.12 DORA completo** [código + Paulo] — depende de o Paulo informar o pipeline de produção e dar leitura de Build/Release ao PAT
  - Frequência de deploy e lead time de mudanças (commit → produção) a partir dos pipelines do Azure DevOps.

- [ ] **T1.11 Validação com dados reais** [Paulo + máquina] — depende de todas
  - Criar o PAT, ligar `AZDO_PAT`, sincronizar o Squad Fiscal, conferir métricas contra o board, colar as rotinas no Grok Bot.
  - Depois: 2 semanas de briefing para o gate.

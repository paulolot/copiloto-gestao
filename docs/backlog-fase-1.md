# Backlog — Fase 1: Boards e rotina

**Objetivo:** a ponte lê o Azure DevOps (somente leitura), calcula as métricas por time e alimenta o briefing diário e o resumo semanal.
**Requisitos:** RF-01 a RF-11, RF-27 (e RF-36 como consequência das ferramentas de consulta).

**Gate de saída:** briefing útil em 4 de 5 dias por 2 semanas, com alertas de board e de métricas vindos da ponte.

Legenda: **[código]** pode ser feito numa sessão na nuvem · **[Paulo]** depende do Paulo (ver `checklist-paulo.md`) · **[máquina]** precisa da máquina do Paulo.

Premissas (confirmar com o Paulo, ver checklist): o Azure DevOps é acessado só por leitura com PAT; Squad Fiscal primeiro, os outros dois times já configurados mas ligados por variável de ambiente; "bloqueado" = tag `Blocked`/`Bloqueado`; "pronto" = estado `Done`, `Closed` ou `Resolved`.

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
  - Itens envelhecendo, bloqueados, WIP por coluna e por pessoa (só agregado), cycle e lead time, throughput, compromisso e escopo adicionado da sprint, bugs abertos/escapados, bug rate, MTTR (Bug Externo), frequência de commit por repositório.
  - Histórico em `metric_snapshots` (por semana e por sprint).
  - Pronto quando: testes com fixture conferem cada métrica e provam que nenhuma saída traz nome de pessoa.

- [x] **T1.4 Alertas e itens-problema** [código] — depende de T1.3 (RF-04, RF-05)
  - Limites padrão do `plano.md`; sem limite, desvio contra a linha de base das últimas 8 semanas.
  - Itens parados, bloqueados, sem dono e sem estimativa.
  - Tabela `sinais` guarda a data em que cada sinal surgiu (alimenta os pontos de atenção do CTO).
  - Pronto quando: testes cobrem cada alerta, a linha de base e a data do primeiro sinal.

- [x] **T1.5 Ferramentas MCP de boards** [código] — depende de T1.4
  - `boards_sincronizar`, `boards_saude(time?)`, `boards_alertas(time?)`, `boards_itens_problema(time, tipo)`, `metricas_time(time, periodo)`; nível `sozinho` (leitura), todas pelo log de auditoria.
  - Pronto quando: cliente MCP de teste chama cada uma e o log registra.

- [ ] **T1.6 Sincronização agendada e alertas no Discord** [código] — depende de T1.4 (RNF-01)
  - A cada hora, dias úteis, 7h às 19h; sinal novo vai para `#alertas`; falha de sincronização também avisa.
  - Pronto quando: teste do agendador (relógio simulado) e da postagem só de sinais novos.

- [ ] **T1.7 Tarefas do Paulo** [código] (RF-08)
  - `tarefa_criar`, `tarefa_listar`, `tarefa_concluir` (prioridade, origem, prazo); nível `sozinho` (lista interna).
  - Pronto quando: testes cobrem ciclo completo. Marcar como feita por botão no Discord fica para o Paulo validar junto com T1.11.

- [ ] **T1.8 Registro de conquistas** [código] (RF-27)
  - `conquista_registrar(titulo, descricao, times, fontes)` cria nota `tipo: conquista` em `inbox/`, com crédito ao time.
  - Pronto quando: teste confirma a nota e o frontmatter.

- [ ] **T1.9 Rotinas do Grok Bot** [código] (RF-07, RF-09, RF-10, RF-11)
  - `grok/rotinas/briefing-diario.md` (7h30), `resumo-semanal.md` (sexta), `observador-boards.md` (hora em hora).
  - Pronto quando: textos prontos para colar, citando fontes e sem ranking individual.

- [ ] **T1.10 Documentação** [código]
  - `docs/conectar.md` com as variáveis do Azure DevOps; `.env.example` atualizado; checklist do Paulo.

- [ ] **T1.11 Validação com dados reais** [Paulo + máquina] — depende de todas
  - Criar o PAT, ligar `AZDO_PAT`, sincronizar o Squad Fiscal, conferir métricas contra o board, colar as rotinas no Grok Bot.
  - Depois: 2 semanas de briefing para o gate.

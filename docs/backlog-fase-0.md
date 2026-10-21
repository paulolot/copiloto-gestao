# Backlog — Fase 0: Fundação

**Objetivo:** Grok Bot lê a agenda e o vault e posta no Discord pela ponte.
**Requisitos:** RF-18, RF-28, RF-31, RF-35 (e a base de RNF-04, RNF-05, RNF-06).

**Gate de saída:** numa rotina de teste do Grok Bot, ele (1) lê a agenda do dia pelo conector do Google, (2) lê uma nota do vault pela ponte e (3) posta um resumo no canal `#briefing` do Discord pela ponte, com a chamada registrada no log de auditoria.

Legenda: **[código]** pode ser feito numa sessão na nuvem · **[Paulo]** depende do Paulo (ver `checklist-paulo.md`) · **[máquina]** precisa da máquina do Paulo.

## Tarefas

- [x] **T0.1 Decidir a linguagem da ponte** [Paulo] ✅ 21/10/2026
  - Decisão: **TypeScript/Node 22** — NuGet estava bloqueado na sessão de nuvem em 21/10/2026; npm funciona. SDK: `@modelcontextprotocol/sdk` + `discord.js`.
  - Pode migrar para .NET 10 depois (equivalente funcional); registrado no `CLAUDE.md`.

- [x] **T0.2 Estrutura do repositório** [código] ✅ 21/10/2026 — depende de T0.1
  - Pastas: `src/ponte` (servidor), `tests/` com `tests/fixtures/`, `extension/` (vazia por ora), `grok/skills`, `grok/rotinas`, `vault-template/`, `tools/importador`.
  - Build e testes rodando com um comando; CI simples no GitHub Actions (build + testes).
  - Configuração por variáveis de ambiente e arquivo local ignorado pelo Git; exemplo versionado (`.env.example` ou `appsettings.example.json`).
  - Pronto quando: build e testes vazios passam no CI.

- [x] **T0.3 Servidor MCP mínimo** [código] ✅ 21/10/2026 — depende de T0.2
  - Transporte HTTP (Streamable HTTP), para o Grok Bot alcançar pelo túnel.
  - Autenticação: token de acesso no cabeçalho, comparado em tempo constante; sem token, 401.
  - Ferramenta `ping` e endpoint de saúde.
  - Pronto quando: um cliente MCP de teste lista as ferramentas e chama `ping` com token, e recebe 401 sem.

- [x] **T0.4 Log de auditoria** [código] ✅ 21/10/2026 — depende de T0.3
  - SQLite. Cada chamada de ferramenta grava: horário, ferramenta, parâmetros sem segredos, origem, resultado (ok/erro), duração.
  - Conteúdo da área restrita não é gravado por extenso no log, só o caminho da nota.
  - Pronto quando: teste confirma o registro de chamadas com sucesso e com erro, e a omissão de conteúdo restrito.

- [x] **T0.5 Política de autonomia e fila de aprovações** [código] ✅ 21/10/2026 — depende de T0.4
  - Cada ferramenta declara seu nível: `sozinho`, `pede_ok` ou `nunca` (tabela de `plano.md`).
  - Ferramentas `pede_ok` criam um item na fila (SQLite) com: ação, conteúdo, destino, motivo, fonte; estado `pendente`, `aprovado`, `editado`, `recusado`, `executado`.
  - Executor separado só age em itens aprovados.
  - Pronto quando: teste prova que uma ferramenta `pede_ok` nunca executa sem aprovação e que `nunca` é sempre recusada.

- [x] **T0.6 Ferramentas do vault** [código] ✅ 21/10/2026 — depende de T0.4
  - `vault_listar(pasta)`, `vault_ler(caminho)`, `vault_buscar(texto, filtros)` por palavra-chave (o índice vetorial vem na fase 2), `vault_criar_nota(tipo, titulo, conteudo, fontes)`.
  - Notas criadas pelo Copiloto vão para `inbox/` com `revisado: false` no frontmatter, nível `sozinho` (plano.md) e sem sobrescrever notas existentes.
  - Caminho do vault configurável; bloqueio de path traversal (nada fora da raiz do vault).
  - Área restrita (`pessoas/` e afins): exige ferramenta específica; `vault_buscar` genérico não devolve conteúdo dela.
  - Pronto quando: testes com um vault de fixture cobrem leitura, busca, criação, traversal e área restrita.

- [x] **T0.7 Bot do Discord** [código] ✅ 21/10/2026 — depende de T0.5
  - Conecta com token do bot; canais configuráveis: `#briefing`, `#alertas`, `#aprovacoes`, `#reunioes`, `#pessoas`, `#cto`.
  - Ferramenta `discord_postar(canal, texto)` (nível `sozinho`, só nos canais do servidor privado).
  - Cada item `pendente` da fila aparece em `#aprovacoes` com botões Aprovar, Editar e Recusar; o clique atualiza a fila e o log.
  - Só o usuário do Paulo (ID configurado) pode aprovar.
  - Pronto quando: testes com cliente Discord simulado cobrem postagem e os três botões; validação real fica no checklist do Paulo.

- [x] **T0.8 Modelo do vault novo** [código] ✅ 21/10/2026
  - `vault-template/` com pastas: `inbox/`, `reunioes/`, `decisoes/`, `times/`, `produtos/`, `pessoas/` (restrita), `papeis/`, `cto/`, `persona/`, `conquistas/`.
  - Frontmatter padrão: `tipo`, `data`, `fonte`, `pessoas`, `times`, `revisado`, `origem`.
  - Modelos de nota para reunião, decisão (com o porquê), pessoa, ponto de atenção (formato do CTO) e conquista.
  - `README` do vault explicando que ele é um repositório Git **privado e separado** deste.
  - Pronto quando: o modelo abre no Obsidian sem erros de frontmatter (validação por script).

- [x] **T0.9 Importador da pasta de colaboradores** [código] ✅ 21/10/2026 — depende de T0.8 (execução real pelo Paulo: ver checklist)
  - CLI: `importar --origem <pasta> --destino <vault>`.
  - Copia preservando a estrutura de pastas, sem nunca alterar o original.
  - Adiciona frontmatter (`origem`, `tipo` inferido pela pasta, `importado_em`) sem sobrescrever o existente.
  - Relatório ao fim: arquivos copiados, ignorados e conflitos; modo `--simular` que não grava nada.
  - Pronto quando: testes com uma pasta de fixture passam; execução real pelo Paulo fica no checklist.

- [x] **T0.10 Skill de persona v1** [código] ✅ 21/10/2026 — aguarda revisão do Paulo com exemplos reais
  - `grok/skills/persona.md`: princípios, tom por contexto, exemplos bons e ruins (os reais são preenchidos com o Paulo).
  - Instruções para o Grok Bot aplicar a persona a qualquer texto em nome do Paulo e citar a regra quando reescrever algo.
  - Pronto quando: o Paulo revisa e aprova a v1.

- [x] **T0.11 Rotina de teste do gate** [código] ✅ 21/10/2026
  - `grok/rotinas/teste-fundacao.md`: prompt da rotina que lê a agenda do dia (conector Google), lê `persona/` pela ponte e posta um resumo em `#briefing`.
  - Pronto quando: o texto está pronto para o Paulo colar no Grok Bot.

- [x] **T0.12 Guia de conexão** [código] ✅ 21/10/2026
  - `docs/conectar.md`: rodar a ponte na máquina do Paulo, criar o túnel (Cloudflare Tunnel ou equivalente) com autenticação, cadastrar o conector MCP personalizado em grok.com/connectors e testar.
  - Pronto quando: o Paulo consegue seguir o guia do zero.

- [ ] **T0.13 Validação do gate** [Paulo + máquina] — depende de todas
  - Rodar a rotina de teste no Grok Bot e conferir agenda, vault, Discord e log.

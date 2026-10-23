# Manual do Copiloto Gestão

> Referência única de comandos, ferramentas, skills e agendamentos. Estado em 23/10/2026 (fase 1 fechando, fase 2 em andamento). Fontes: `src/ponte/mcp.ts`, `src/ponte/agendador.ts`, `src/ponte/discord/ajuda.ts`, `grok/rotinas/` e `grok/skills/`. Se algo aqui divergir do código, vale o código.

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Operação diária da ponte](#2-operação-diária-da-ponte)
3. [Agendamentos](#3-agendamentos)
4. [Comandos do Discord](#4-comandos-do-discord)
5. [Canais do Discord](#5-canais-do-discord)
6. [Ferramentas da ponte (MCP)](#6-ferramentas-da-ponte-mcp)
7. [Skills](#7-skills)
8. [Rotinas do Grok Bot](#8-rotinas-do-grok-bot)
9. [Política de autonomia e fila de aprovações](#9-política-de-autonomia-e-fila-de-aprovações)
10. [Variáveis de ambiente (`.env`)](#10-variáveis-de-ambiente-env)
11. [Scripts e utilitários](#11-scripts-e-utilitários)
12. [Auditoria](#12-auditoria)
13. [Problemas comuns](#13-problemas-comuns)

---

## 1. Visão geral

| Peça | Onde roda | O que faz |
| --- | --- | --- |
| **Grok Bot** | Nuvem | Cérebro. Roda as rotinas agendadas e as skills; lê Gmail, Calendar e Drive pelos conectores nativos |
| **Ponte MCP** (`src/`) | Máquina do Paulo (porta 3333, atrás do túnel Cloudflare) | Dá ao Grok acesso a Azure DevOps (só leitura), vault, Discord e fila de aprovações. Impõe a autonomia e grava a auditoria |
| **Bot do Discord** | Dentro da ponte | Comandos `/`, botões de aprovação, botão "feita" das tarefas, leitura dos canais de entrada |
| **Vault** (`VAULT_PATH`) | Repositório privado, fora deste | Notas em markdown: inbox, reuniões, decisões, conquistas, papéis, persona e `pessoas/` (área restrita) |
| **Extensão do Chrome** (`extension/`) | Chrome | Legendas do Meet. Fase 3; a pasta está vazia por ora |

Regras que valem em tudo: toda resposta cita a fonte; métricas são por time (sem ranking); escrita que chega a outra pessoa ou muda board espera o OK do Paulo; segredos e conteúdo do vault nunca entram no repositório.

---

## 2. Operação diária da ponte

### Subir, parar, reiniciar (Windows)

| Comando | O que faz |
| --- | --- |
| `iniciar.bat` | Para o que estiver rodando (ponte e túnel), recompila (`npm run build`), sobe a ponte e o túnel em duas janelas ("Ponte MCP" e "Tunel Cloudflare"). Serve para **reiniciar** depois de `git pull` ou de mudar o `.env` |
| `parar.bat` | Encerra o processo na porta 3333 e **todos** os `cloudflared.exe` |

Para iniciar com o Windows, ponha um atalho do `iniciar.bat` em `shell:startup` (`Win + R`).

### Subir na mão

```bash
npm install
npm run build && npm start     # produção (lê o .env)
npm run dev                    # desenvolvimento, sem compilar
cloudflared tunnel run copiloto-gestao
```

### Conferir que está vivo

```bash
curl http://localhost:3333/health          # {"status":"ok",...}
```

Pelo Grok Bot: chame a ferramenta `ping` (deve responder `pong`).

Mensagens que a ponte imprime ao subir:

| Mensagem | Significa |
| --- | --- |
| `Ponte MCP no ar: http://localhost:3333/mcp` | Servidor no ar |
| `Bot do Discord conectado` | Aprovações e comandos `/` funcionando |
| `Bot do Discord desativado` / `NÃO iniciou` | Falta `DISCORD_BOT_TOKEN`, `DISCORD_OWNER_ID` ou `DISCORD_CANAL_APROVACOES`; a ponte segue sem a fila |
| `Sincronização do Azure DevOps agendada` | Ciclo de boards ligado |
| `Azure DevOps desativado` | Falta `AZDO_ORG` ou `AZDO_PAT` |
| `Busca por significado ligada` / `desativada` | `EMBEDDER=local` ligado ou não |

### Ligar o Grok Bot à ponte

Em grok.com/connectors → MCP personalizado: nome **Copiloto Gestão**, URL `https://copiloto.SEUDOMINIO.com/mcp/SEU_PONTE_TOKEN`. Detalhes em `docs/conectar.md`.

---

## 3. Agendamentos

Há dois tipos: o que a **ponte** executa sozinha e o que o **Grok Bot** executa (rotinas cadastradas por você). Fuso: **America/Sao_Paulo**.

### 3.1 Ponte (automático, sem cadastro)

| O quê | Quando | O que faz | Desligar |
| --- | --- | --- | --- |
| **Ciclo de boards** | A cada hora, **dias úteis, 7h às 19h** (a de 19h não roda). Roda também uma vez ao subir, se estiver na janela | Sincroniza os times ativos no Azure DevOps, recalcula sinais (itens parados, bloqueados, bug sem dono, queda de ritmo, repositório sem commit, marcos em risco, 1:1 e PDI atrasados), posta em `#alertas` só os sinais **novos** e o ✅ dos resolvidos. Falha de sincronização é avisada uma vez por erro distinto | `AZDO_SYNC_AGENDADO=nao` |

Os sinais de 1:1 e PDI atrasados não são anunciados em canal nenhum; aparecem só pelo briefing (`um_a_um_pendentes`).

### 3.2 Rotinas do Grok Bot

| # | Rotina | Quando | Cron | Conectores | Escreve em |
| --- | --- | --- | --- | --- | --- |
| 1 | **Briefing diário** | 7h30, seg a sex (precisa chegar antes das 8h) | `30 7 * * 1-5` | Calendar, Gmail, Drive | `#briefing` (e `#alertas` se algo grave) |
| 2 | **Planejamento** | 8h, 10h, 12h, 14h, 16h, 18h, seg a sex | `0 8,10,12,14,16,18 * * 1-5` | nenhum | `#planejamento` |
| 3 | **Captura** | mesmos horários da rotina 2 | `0 8,10,12,14,16,18 * * 1-5` | nenhum | `#insights`, `#pessoas`, `#cobrancas` |
| 4 | **Resumo semanal** | sexta, 16h | `0 16 * * 5` | Calendar | `#briefing` |
| 5 | **Observador de boards** (opcional) | de hora em hora, 8h às 18h, seg a sex | `0 8-18 * * 1-5` | nenhum | `#alertas` |
| 6 | **Teste de fundação** | manual, uma vez (gate da fase 0, já passou) | — | Calendar | `#briefing` |

Todas precisam do conector MCP **Copiloto Gestão**. O prompt de cada uma está em `grok/rotinas/<nome>.md`.

### 3.3 Rotinas planejadas (ainda sem texto)

| Rotina / skill | Fase | Quando vai rodar | O que fará |
| --- | --- | --- | --- |
| Preparador de reunião | 2 | a cada 30 min, 7h às 19h (`*/30 7-19 * * 1-5`) | Nota de preparação (pauta, pendências, documentos); posta em `#reunioes` |
| Porta-voz (pauta do CTO) | 2 | todo dia 9h, age só quando a reunião quinzenal é em 2 dias | Pauta de evoluções, decisões e pontos de atenção; posta em `#cto` |
| Curador da memória | 5 | toda noite, 22h (`0 22 * * 1-5`) | Organiza o vault, revisa a inbox, atualiza o índice |
| Escriba | 4 | a cada 15 min, 8h às 19h | Nota pós-reunião e rascunhos de ações para aprovar |
| Coach de pessoas (skill) | 2 | sob demanda, antes e depois de cada 1:1 | Pauta e registro de 1:1, PDI |
| Copiloto de reunião (skill) | 3 | sob demanda, durante a call | Responde com a transcrição ao vivo |

### 3.4 Quantas execuções por dia

Rotinas 1 a 5: 1 + 6 + 6 + 11 = **24 execuções por dia útil**, mais 1 por semana. Se o plano do Grok limitar:

- Una **Planejamento** e **Captura** em uma rotina ("Conversas"), colando o prompt de `captura.md` depois do de `planejamento.md` → 6 execuções/dia.
- Dispense o **Observador**: a ponte já posta os sinais novos em `#alertas` → 13 execuções/dia.
- Os comandos `/` não gastam execução.

### 3.5 Ordem de cadastro recomendada

1. Skill Persona → 2. Teste de fundação (só se a conexão foi refeita) → 3. Briefing diário (use alguns dias) → 4. Planejamento e Captura → 5. Resumo semanal → 6. Observador (só se os alertas da ponte não bastarem).

### 3.6 Teste de 1 minuto por rotina

| Rotina | Teste |
| --- | --- |
| Briefing | Rode manualmente; deve chegar em `#briefing` com "Fontes consultadas" |
| Planejamento | Em `#planejamento`: "regras do próximo marco do fiscal: confiança 95"; na próxima execução ela responde o que registrou; confira com `/marcos` |
| Captura | Escreva uma frase solta em `#insights`; depois da execução a resposta mostra o caminho em `inbox/` |
| Resumo semanal | Rode numa quarta; deve trazer o que andou, o que travou, marcos e riscos |
| Observador | Provoque um sinal (item paralisado) e confira `#alertas` |

---

## 4. Comandos do Discord

Só o dono (`DISCORD_OWNER_ID`) consegue usar. Cada comando só funciona nos canais indicados. Respondem na hora, sem passar pelo Grok.

| Comando | Onde | Opções | O que faz |
| --- | --- | --- | --- |
| `/ajuda` | qualquer canal | `canal` (opcional; padrão o atual) | Para que serve o canal e como usá-lo |
| `/tarefa` | `#planejamento` | `titulo` (obrig.), `prioridade` (alta, media, baixa; padrão media), `prazo` (hoje, amanha, 25/10, 25/10/2026, 2026-10-25) | Cria tarefa na sua lista |
| `/tarefas` | `#planejamento`, `#briefing`, `#cobrancas` | nenhuma | Lista as tarefas abertas com botão ✔ "feita" (só você clica) |
| `/marcos` | `#planejamento` | nenhuma | Andamento dos marcos e chance de cumprir a data |
| `/cobrar` | `#cobrancas` | `pessoa` (obrig.), `assunto` (obrig.), `lembrar_em` (hoje, amanha, 25/10…; padrão amanha) | Lembrete para cobrar algo de alguém; aparece no briefing do dia |
| `/insight` | `#insights` | `texto` (obrig.), `tema` (opcional) | Nota na `inbox/` do vault |
| `/pessoa` | `#pessoas` | `nome` (obrig.), `tipo` (impressao, conversa, feedback, combinado), `texto` (obrig.) | Registra em sigilo na área restrita; a resposta mostra só o caminho |

Exemplos:

```text
/tarefa titulo:Revisar proposta do fiscal prioridade:alta prazo:25/10
/cobrar pessoa:Ana assunto:laudo da NFC-e lembrar_em:25/10
/insight texto:O time trava sempre na revisão de segunda tema:fila de revisão
/pessoa nome:Ana tipo:impressao texto:Tomou a frente do problema da NFC-e sem ser pedido
/ajuda canal:insights
```

### Botões

| Botão | Onde | Efeito |
| --- | --- | --- |
| **Aprovar** | `#aprovacoes` | Marca o item como aprovado (e executa, se houver handler) |
| **Editar** | `#aprovacoes` | Abre uma janela para ajustar o texto; aprova com o texto editado |
| **Recusar** | `#aprovacoes` | Recusa o item |
| **✔ feita** | mensagens de tarefas | Conclui a tarefa |

Cada decisão fica no log de auditoria. Itens sem resposta ficam pendentes; nada expira.

---

## 5. Canais do Discord

Texto livre nos canais de **entrada** é lido pelas rotinas a cada 2 horas (8h–18h). Os de **saída** só o Copiloto escreve. Os tópicos prontos para colar estão em `docs/discord-canais.md` (gerado por `npm run docs:discord`).

| Canal | Tipo | Para que serve | Comandos |
| --- | --- | --- | --- |
| `#briefing` | saída | Briefing diário (7h30) e resumo semanal (sexta 16h) | `/tarefas`, `/ajuda` |
| `#alertas` | saída | Sinais novos dos boards (🔴 agir hoje, 🟡 ficar de olho), marcos em risco, falha de sincronização, ✅ resolvido | `/ajuda` |
| `#aprovacoes` | saída | Fila de aprovações com Aprovar / Editar / Recusar | `/ajuda` |
| `#planejamento` | entrada | Marcos, regras do próximo marco, tarefas, decisões | `/tarefa`, `/tarefas`, `/marcos`, `/ajuda` |
| `#insights` | entrada | Ideias e observações do dia → `inbox/` | `/insight`, `/ajuda` |
| `#cobrancas` | entrada | O que alguém ficou de entregar e você quer lembrar de cobrar | `/cobrar`, `/tarefas`, `/ajuda` |
| `#pessoas` | entrada (sigilo) | Impressões, conversas, feedbacks e combinados → `pessoas/` (restrita) | `/pessoa`, `/ajuda` |
| `#reunioes` | saída (fase 2) | Preparação e resumo de reuniões | `/ajuda` |
| `#cto` | saída (fase 2) | Pauta quinzenal do CTO | `/ajuda` |

Exemplos de texto livre:

- `#planejamento`: "regras do próximo marco do fiscal: confiança 95, janela 8 semanas" · "marco NFC-e: tag entrega-x7, data 15/12"
- `#cobrancas`: "cobrar o Pedro do deploy na sexta"
- `#insights`: "cliente X pediu de novo o relatório Y"

Requisitos: **Message Content Intent** ligado no Discord Developer Portal (ou mencionar o bot com @). Permissões e convite: `docs/discord-configuracao.md`.

---

## 6. Ferramentas da ponte (MCP)

40 ferramentas. Nível: **sozinho** (executa e registra), **pede OK** (vai à fila de aprovações), **leitura** (não altera nada). Todas gravam no log de auditoria. As marcadas 🔒 usam a **área restrita**: o conteúdo nunca vai ao log nem a canal compartilhado.

### 6.1 Sistema

| Ferramenta | Nível | Parâmetros | O que faz |
| --- | --- | --- | --- |
| `ping` | leitura | — | Responde `pong`; confere a conexão |

### 6.2 Vault (notas)

| Ferramenta | Nível | Parâmetros | O que faz |
| --- | --- | --- | --- |
| `vault_listar` | leitura | `pasta?` | Lista arquivos e pastas (área restrita fica de fora) |
| `vault_ler` | leitura | `caminho` | Lê uma nota (área restrita bloqueada) |
| `vault_buscar` | leitura | `texto`, `pasta?`, `dataInicio?`, `dataFim?` | Busca por palavra-chave; datas AAAA-MM-DD do frontmatter |
| `vault_buscar_semantico` | leitura | `texto`, `time?`, `pessoa?`, `desde?`, `ate?`, `limite?` (1–20) | Busca por significado, só em notas com `revisado: true`. Exige `EMBEDDER=local` |
| `vault_reindexar` | sozinho | `total?` | Atualiza o índice semântico (só o que mudou) ou reconstrói tudo |
| `vault_criar_nota` | sozinho | `tipo`, `titulo`, `conteudo`, `fontes?` | Cria nota em `inbox/` com `revisado: false`. Tipos: reuniao, decisao, pessoa, atencao, conquista |
| `papel_ler` | leitura | `papel` | Plano de um papel (Tech Lead, Scrum Master…): competências, expectativas por nível, trilha e sinais de prontidão |
| `conquista_registrar` | sozinho | `titulo`, `descricao`, `times?`, `fontes` (≥1) | Registra conquista em `inbox/` (`revisado: false`), com crédito ao time |

### 6.3 Boards (Azure DevOps, só leitura)

`time` aceita `fiscal`, `desktop` ou `retaguarda`; sem ele, vale para todos os times ativos (`AZDO_TIMES`).

| Ferramenta | Nível | Parâmetros | O que faz |
| --- | --- | --- | --- |
| `boards_sincronizar` | sozinho | `time?` | Atualiza work items, commits e PRs. A primeira carga traz 12 semanas |
| `boards_saude` | leitura | `time?` | Métricas, sinais ativos com a data em que surgiram e quem está com WIP acima do limite |
| `boards_alertas` | leitura | `time?` | Sinais de alerta ativos com a data do primeiro sinal |
| `boards_itens_problema` | leitura | `time`, `tipo` (parados, bloqueados, sem_dono, sem_estimativa) | Lista dos work items com o problema |
| `boards_tags` | leitura | `time?` | Tags em uso nos itens abertos e quantos itens cada uma tem (para achar a tag de um marco) |
| `boards_marcos` | leitura | `id?`, `incluirEncerrados?` | Andamento dos marcos: entregues, em andamento, aguardando release, paralisados, parados, dias até a data, adiamentos e risco |
| `marco_definir` | sozinho | `id?`, `nome?`, `time?`, `tag?`, `data?`, `confianca?` (50–99, padrão 85), `janelaSemanas?` (4–52, padrão 12), `tipos?`, `escopoFechado?`, `observacao?`, `estado?` (ativo, entregue, cancelado) | Cria ou muda um marco e suas regras. Só regras = próximo marco planejado; com tag e data passa a ser acompanhado. Data posterior conta como adiamento. Depois de usar, repita ao Paulo o que ficou registrado |
| `metricas_time` | leitura | `time`, `periodo?` (atual, historico) | Métricas do time, atuais ou histórico semanal e mensal |
| `metricas_colaborador` | leitura 🔒 | `pessoa`, `time?` | Métricas individuais (WIP, entregas, cycle time, itens parados e paralisados). Para 1:1 e PDI, sem ranking |
| `metricas_colaboradores` | leitura 🔒 | `time?` | Métricas de todos de um time, em ordem alfabética (nunca por desempenho) |

### 6.4 Tarefas e cobranças

| Ferramenta | Nível | Parâmetros | O que faz |
| --- | --- | --- | --- |
| `tarefa_criar` | sozinho | `titulo`, `prioridade?` (alta, media, baixa), `origem?`, `prazo?`, `cobrarDe?`, `lembrarEm?` | Cria tarefa. Para cobrança, informe `cobrarDe` e `lembrarEm` |
| `tarefa_listar` | leitura | `incluirFeitas?`, `soCobrancas?`, `lembrarAte?` | Tarefas abertas por prioridade e data |
| `tarefa_concluir` | sozinho | `id` | Marca como feita |
| `tarefas_postar` | sozinho | `canal?` (briefing, alertas) | Posta a lista no Discord com botão ✔ por tarefa |

### 6.5 Discord

| Ferramenta | Nível | Parâmetros | O que faz |
| --- | --- | --- | --- |
| `discord_postar` | sozinho | `canal` (briefing, alertas, aprovacoes, reunioes, pessoas, cto, planejamento, insights, cobrancas), `texto` (≤2000) | Posta no servidor privado do Paulo |
| `discord_ler_novas` | leitura | `canal?` (planejamento, insights, pessoas, cobrancas) | Lê só as mensagens novas **do Paulo** (outros e bots são ignorados). Devolve `ateId` |
| `discord_marcar_lido` | sozinho | `canal?`, `ateId` | Marca como tratadas até aquele id |

### 6.6 Pessoas, PDI e 1:1 🔒

Área restrita: o texto nunca aparece no log (só o caminho da nota) e nunca vai a canal compartilhado.

| Ferramenta | Nível | Parâmetros | O que faz |
| --- | --- | --- | --- |
| `pessoa_registrar` | sozinho | `pessoa`, `tipo` (impressao, conversa, feedback, combinado), `texto`, `fonte?` | Grava em `pessoas/<nome>/`; confirme só o caminho |
| `pessoa_listar` | leitura | `pessoa` | Caminhos das notas, da mais recente para a mais antiga |
| `pessoa_ler` | leitura | `caminho` | Lê uma nota dentro de `pessoas/` |
| `pessoa_perfil` | leitura | `pessoa` | Junta perfil, PDI, últimos 1:1, registros recentes, sinais do board e conquistas. Dados e caminhos, nunca opinião |
| `pessoa_buscar_semantico` | leitura | `texto`, `pessoa?`, `desde?`, `ate?`, `limite?` | Busca por significado na área restrita. Exige `EMBEDDER=local` |
| `um_a_um_pendentes` | leitura | — | Por pessoa: último 1:1, cadência, dias de atraso e revisões de PDI vencidas. Só nomes e números, ordem alfabética |
| `um_a_um_preparar` | leitura | `pessoa` | Reúne PDI, combinados do último 1:1, sinais do board, registros desde o último 1:1, conquistas e temas sugeridos |
| `um_a_um_salvar_pauta` | sozinho | `pessoa`, `texto` (≤20000), `fontes` (≥1), `data?` | Grava a pauta em `pessoas/<nome>/1x1/AAAA-MM-DD-pauta.md` (`revisado: false`) e avisa em `#pessoas` só o caminho |
| `pdi_ler` | leitura | `pessoa` | Objetivo, ações (id, descrição, competência, prazo, status) e avisos |
| `pdi_atualizar` | sozinho | `pessoa`, `acao` (criar, adicionar, atualizar, revisar), `objetivo?`, `id?`, `descricao?`, `competencia?`, `prazo?`, `status?` (aberta, em andamento, concluída, cancelada) | Cria o PDI, adiciona/atualiza ação ou registra a revisão (próxima em 6 meses, `PDI_REVISAO_MESES`). Tudo volta para `revisado: false` |
| `pdi_atrasados` | leitura | — | Ações com prazo vencido e revisões vencidas, por pessoa em ordem alfabética |
| `pdi_compartilhar` | **pede OK** | `pessoa`, `canal` | Propõe compartilhar o PDI (sem notas internas) com a própria pessoa. Exige `revisado: true`. Vai sempre para a fila |

Fluxo de 1:1: `um_a_um_preparar` → escrever a pauta no tom do Paulo (skill Persona) → `um_a_um_salvar_pauta`.

### 6.7 Mensagens e aprovações

| Ferramenta | Nível | Parâmetros | O que faz |
| --- | --- | --- | --- |
| `mensagem_propor` | **pede OK** | `destinatario`, `canal` (email, teams, whatsapp, discord, reuniao, outro), `texto`, `motivo`, `fontes?` | Enfileira texto para **outra pessoa**. Nada é enviado: o Paulo decide em `#aprovacoes` e copia o texto aprovado |
| `aprovacao_consultar` | leitura | `id` | Estado do item e texto final (o editado, se houve edição). Recusado ou pendente não devolve texto |

---

## 7. Skills

| Skill | Arquivo | Quando usar |
| --- | --- | --- |
| **Persona** (v1, 22/10/2026) | `grok/skills/persona.md` | Sempre que redigir, revisar ou reescrever texto em nome do Paulo: mensagens, e-mails, posts no Discord, pauta do CTO, respostas numa call, notas compartilhadas, pauta de 1:1 e feedback |

A Persona define o líder que o Paulo está se tornando e sete princípios em ordem de prioridade: responsabilidade por resultados, clareza respeitosa, autonomia com presença, confiança e equilíbrio emocional, desenvolvimento de pessoas, integridade factual e colaboração entre áreas. Texto para outra pessoa passa por ela e entra na fila com `mensagem_propor`. As rotinas leem `persona/guia-de-estilo.md` no vault antes de escrever. O texto integral fica no vault privado; as pendências estão em `docs/checklist-paulo.md`.

A skill **Coach de pessoas** (fase 2) e a **Copiloto de reunião** (fase 3) ainda não têm texto.

---

## 8. Rotinas do Grok Bot

> Para conversar com o Copiloto sob demanda, `grok/agentes.md` organiza os assuntos em 5 agentes (Boards, Planejamento, Pessoas, Comunicação, Memória), com instruções prontas para colar e a lista de ferramentas e comandos de cada um.

### Ferramentas que cada rotina usa

| Rotina | Ferramentas |
| --- | --- |
| Briefing diário | `boards_sincronizar`, `boards_saude`, `boards_itens_problema`, `um_a_um_pendentes`, `tarefa_listar`, `tarefa_criar`, `tarefas_postar`, `vault_ler`, `discord_postar` |
| Planejamento | `discord_ler_novas`, `discord_marcar_lido`, `discord_postar`, `marco_definir`, `boards_marcos`, `boards_tags`, `tarefa_criar`, `tarefa_concluir`, `vault_criar_nota` |
| Captura | `discord_ler_novas`, `discord_marcar_lido`, `discord_postar`, `vault_criar_nota`, `vault_buscar`, `pessoa_registrar`, `tarefa_criar`, `tarefa_listar`, `tarefa_concluir` |
| Resumo semanal | `boards_sincronizar`, `metricas_time`, `boards_alertas`, `boards_itens_problema`, `boards_marcos`, `vault_buscar`, `conquista_registrar`, `tarefa_listar`, `discord_postar` |
| Observador de boards | `boards_alertas`, `boards_itens_problema`, `discord_postar` |

### O que cada uma entrega

- **Briefing diário** — agenda de hoje (Calendar); saúde dos boards por time; 1:1 e PDI atrasados; e-mails que pedem ação (Gmail); documentos das reuniões de hoje (Drive); tarefas; cobranças do dia; tempo para as tarefas (Calendar). Termina com "Fontes consultadas".
- **Planejamento** — lê o que você escreveu em `#planejamento`, registra marcos e regras (`marco_definir`), tarefas e decisões, e responde dizendo o que registrou para você corrigir.
- **Captura** — `#insights` → nota na `inbox/`; `#pessoas` → área restrita (confirma só o caminho); `#cobrancas` → tarefa de cobrança. Existe para o texto livre; os comandos `/` gravam na hora.
- **Resumo semanal** — o que andou, o que travou, decisões da semana, conquistas e riscos da semana seguinte; métricas sempre por time.
- **Observador de boards** — lê `boards_alertas` e só fala quando há algo que você precisa saber agora.

---

## 9. Política de autonomia e fila de aprovações

| Nível | Comportamento |
| --- | --- |
| **sozinho** | Executa na hora e registra no log |
| **pede OK** | Cria item na fila; o Paulo aprova, edita ou recusa em `#aprovacoes` |
| **nunca** | Sempre rejeitado e registrado como erro |

| Ação | Nível |
| --- | --- |
| Criar e editar notas no vault; gerar briefing, alertas e nota de preparação; bloquear tempo na própria agenda | Sozinho |
| Registrar 1:1 e atualizar PDI no vault (área restrita) | Sozinho |
| Compartilhar PDI com a pessoa | Pede OK, sempre |
| Comentar em work item; criar ou alterar work item | Pede OK |
| Enviar mensagem ou e-mail a outra pessoa; aceitar, recusar ou marcar reunião com outros | Pede OK |
| Enviar relatório ou pacote de decisão ao CTO; alterar o guia de persona | Pede OK, não sobe |
| Apagar qualquer coisa fora do vault | Nunca |

Hoje a ponte **não tem handler de envio**: um item aprovado fica como `aprovado` e o Paulo copia o texto e envia. A ponte também **não escreve no Azure DevOps** (nenhuma ferramenta altera work item, comentário ou repositório).

Fluxo de uma mensagem para outra pessoa: texto na voz do Paulo (Persona) → `mensagem_propor` → item `#N` em `#aprovacoes` → Paulo clica → `aprovacao_consultar` com `id: N` devolve o texto final.

---

## 10. Variáveis de ambiente (`.env`)

Modelo em `.env.example`. Nunca versione o `.env`.

| Variável | Obrig.? | Padrão | Para que serve |
| --- | --- | --- | --- |
| `PONTE_TOKEN` | sim | — | Token de acesso à ponte (a ponte não sobe sem ele nem com o valor de exemplo) |
| `PONTE_PORT` | não | `3333` | Porta local |
| `DB_PATH` | recomendado | `./copiloto.db` | Banco (auditoria, fila, sinais, tarefas). Sem ele os dados somem ao reiniciar |
| `VAULT_PATH` | sim | — | Raiz do vault |
| `DISCORD_BOT_TOKEN` | sim | — | Token do bot |
| `DISCORD_GUILD_ID` | sim | — | ID do servidor |
| `DISCORD_OWNER_ID` | sim | — | Seu ID; único autorizado a aprovar e usar `/` |
| `DISCORD_CANAL_BRIEFING`, `_ALERTAS`, `_APROVACOES`, `_REUNIOES`, `_PESSOAS`, `_CTO`, `_PLANEJAMENTO`, `_INSIGHTS`, `_COBRANCAS` | sim | — | ID de cada canal |
| `AZDO_ORG` | para boards | `metanetsistema` | Organização do Azure DevOps |
| `AZDO_PAT` | para boards | — | Token **somente leitura** (Work Items, Code, Analytics) |
| `AZDO_TIMES` | não | só `fiscal` | Times sincronizados, por id (`fiscal`, `desktop`, `retaguarda`) ou nome da área (`Squad Fiscal`…) |
| `AZDO_TIPOS` | não | `User Story,Bug` | Tipos que entram nas métricas |
| `AZDO_COLUNAS_IGNORADAS` | não | `Ideias,UX` | Colunas fora de toda métrica |
| `AZDO_CAMPO_PARALISADO` / `AZDO_CAMPO_TIPO_BUG` | não | `Custom.Status` / `Custom.TipoBug` | Nome técnico dos campos personalizados |
| `AZDO_SYNC_AGENDADO` | não | `sim` | `nao` desliga o ciclo horário |
| `ALERTAS_COM_RESPONSAVEL` | não | `sim` | Nome do dono do card nos avisos de `#alertas`; `nao` desliga |
| `ALERTAS_REANUNCIAR` | não | — | Use **uma vez**, junto de um restart, para reavisar os sinais já ativos; depois apague |
| `LIMITE_ENVELHECIMENTO_DIAS` | não | `7` | Dias para um item contar como envelhecido |
| `LIMITE_BLOQUEIO_DIAS_UTEIS` | não | `2` | Dias úteis bloqueado para alertar |
| `LIMITE_WIP_PESSOA` | não | `3` | WIP máximo por pessoa |
| `LIMITE_BUG_RATE_PERCENT` | não | `10` | Taxa de bugs que dispara alerta |
| `LIMITE_BUG_RATE_AMOSTRA_MINIMA` | não | `10` | Amostra mínima para avaliar a taxa de bugs |
| `LIMITE_COMMIT_PARADO_DIAS_UTEIS` | não | `3` | Dias úteis sem commit num repositório |
| `EMBEDDER` | não | desligado | `local` liga a busca por significado (antes: `npm install @huggingface/transformers`) |
| `EMBEDDER_MODELO` | não | modelo padrão | Modelo de embeddings local |
| `INDICE_PATH` | não | `<DB_PATH>.indice` | Arquivo do índice semântico |
| `PDI_REVISAO_MESES` | não | `6` | Intervalo de revisão do PDI |

---

## 11. Scripts e utilitários

| Comando | O que faz |
| --- | --- |
| `npm test` / `npm run test:watch` | Testes (Jest) |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm start` | Sobe a ponte compilada |
| `npm run dev` | Sobe a ponte direto do código (tsx) |
| `npm run importar -- --origem <pasta> --destino <vault> [--simular]` | Importa a pasta de colaboradores para `pessoas/` do vault. Rode antes com `--simular` |
| `npm run indexar` | Atualiza o índice semântico (só o que mudou) |
| `npm run indexar -- --total` | Reconstrói o índice a partir das notas |
| `npm run indexar -- --buscar "pergunta"` | Teste rápido da busca no índice principal |
| `npm run docs:discord` | Regenera `docs/discord-canais.md` a partir de `src/ponte/discord/ajuda.ts`. Um teste falha se o arquivo estiver desatualizado |

Para trocar o texto de ajuda ou o tópico de um canal, mude `src/ponte/discord/ajuda.ts` e rode `npm run docs:discord`; não edite o `.md` à mão.

---

## 12. Auditoria

Toda chamada de ferramenta é registrada: ferramenta, parâmetros (sem segredos), origem (`mcp`, `agendador` ou Discord), resultado, duração e horário. Nas ferramentas 🔒 o nome da pessoa e o texto viram `[restrito]`; só o caminho da nota é guardado.

Últimas 20 chamadas, no banco da ponte:

```sql
SELECT tool, origin, result, ts FROM audit_log ORDER BY id DESC LIMIT 20;
```

Entradas do agendador aparecem como `boards_sync_agendado`, `marcos_sinais` e `um_a_um_sinais`.

---

## 13. Problemas comuns

| Problema | Solução |
| --- | --- |
| `PONTE_TOKEN não configurado` | Preencha com um token próprio, não o de exemplo |
| `401 Unauthorized` | Token do `.env` diferente do cadastrado no Grok Bot |
| Cloudflare 502 | A ponte não está rodando: `iniciar.bat` ou `npm start` |
| `VAULT_PATH não configurado` | Variável ausente no `.env` |
| `Área restrita` | Use a ferramenta específica para `pessoas/` |
| Botões de aprovação não aparecem | Confira `DISCORD_BOT_TOKEN`, `DISCORD_OWNER_ID` e `DISCORD_CANAL_APROVACOES` |
| `/` não aparece no Discord | O bot precisa do escopo `applications.commands` (`docs/discord-configuracao.md`) |
| Mensagens do Paulo chegam vazias | Ligue o **Message Content Intent** do bot ou mencione o bot com @ |
| `Azure DevOps não configurado` | Faltam `AZDO_ORG` ou `AZDO_PAT` |
| `Azure DevOps respondeu 401` | PAT vencido, errado ou sem leitura |
| `Azure DevOps respondeu 403/404` | PAT sem acesso ao projeto, ou área com outro nome (`src/ponte/azure/escopo.ts`) |
| `Azure DevOps respondeu 400` na sincronização | Nome técnico errado de Paralisado ou Tipo Bug |
| Boards com números estranhos | Confira o campo Paralisado e os estados de pronto (`Done`, `Closed`, `Resolved`) |
| `Busca por significado não configurada` | Defina `EMBEDDER=local` e reinicie |
| `#alertas` não recebe nada | Confira se há `AZDO_PAT`, se `AZDO_SYNC_AGENDADO` não é `nao` e se está entre 7h e 19h em dia útil |

Veja também: `docs/conectar.md` (instalação passo a passo), `docs/checklist-paulo.md` (o que só o Paulo faz), `docs/plano.md` (decisões e fases), `grok/rotinas/README.md` (roteiro de cadastro).

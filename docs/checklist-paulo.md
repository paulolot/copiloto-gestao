# Checklist do Paulo

O que só você pode fazer, porque depende das suas contas ou da sua máquina. Marque conforme avança; as sessões de desenvolvimento leem este arquivo.

## Antes de começar (fase 0)

- [X] **Linguagem da ponte** (tarefa T0.1): .NET 10 ou TypeScript. Se for .NET, liberar `api.nuget.org` e `globalcdn.nuget.org` em claude.ai → Settings → Capabilities, para a sessão na nuvem baixar pacotes.
- [X] **Grok Bot:** confirmar que o seu plano do Cursor inclui o Grok Bot (Ultra ou Premium Teams).
- [X] **Conectores do Google no Grok Bot:** em grok.com/connectors, ligar Gmail, Calendar e Drive com a conta da empresa e confirmar que funcionam.
- [X] **Transcrição do Meet:** verificar se a transcrição de reuniões está ativa no Workspace da empresa.
- [X] **Discord:**
  - [X] Criar um servidor privado só seu, com verificação em duas etapas na sua conta.
  - [X] Criar os canais: `#briefing`, `#alertas`, `#aprovacoes`, `#reunioes`, `#pessoas`, `#cto`.
  - [X] Criar a aplicação e o bot no Discord Developer Portal, copiar o token (guardar fora do Git) e convidar o bot para o servidor.
  - [X] Anotar o seu ID de usuário no Discord (único autorizado a aprovar).
- [X] **Vault:**
  - [X] Escolher a pasta do vault novo na sua máquina.
  - [ ] Criar um repositório GitHub **privado e separado** para o vault (nunca usar este repositório para dados de pessoas).
  - [ ] Informar o caminho da pasta atual de colaboradores, para o importador.
- [x] **Persona:** compilado do curso e mensagens reais entregues em 22/10/2026 (persona v1 montada com o roteiro guiado no ChatGPT). Falta completar os itens `[a completar]` do texto integral (ver "Persona v1" abaixo).
- [X] **Máquina:** instalar o SDK da linguagem escolhida e a ferramenta de túnel (por exemplo `cloudflared`).

## Fase 1 (adiantar se quiser)

- [X] **Token do Azure DevOps:** criar um Personal Access Token na organização `metanetsistema` com escopo **somente leitura**: Work Items (Read), Code (Read), Analytics (Read). Guardar fora do Git.
- [X] **Confirmar a estrutura do Azure DevOps.** Só User Story e Bug entram nas métricas (Feature, Épico e Atendimento ficam de fora); o nome exato do tipo é `User Story`, ou ajuste `AZDO_TIPOS`. Já respondido em 21/10/2026: área `Metanet\Squad Desktop`, bloqueio = campo Paralisado, bug de produção = campo Tipo Bug "Bug Externo". Falta:
  - [x] Nome técnico do campo Tipo Bug: `Custom.TipoBug` (confirmado em 21/10/2026).
  - [x] Respondido: lead de Backlog a Concluído; cycle de Fazendo Análise a Pronto pra release (Resolved); Ideias e UX fora; Fiscal sem Release candidate; throughput só em Concluído.
  - [x] Depois da primeira sincronização, conferir `fonte.colunasDesconhecidas` em `boards_saude`: se aparecer algum nome, é coluna que o código não reconheceu (a comparação ignora maiúsculas, acentos e espaços, então seria outra grafia ou outra coluna). Me diga o nome exato.
  - [x] Campo de pontos: usei `StoryPoints` e, na falta, `Effort`.
- [X] **Configurar o bot do Discord:** siga `docs/discord-configuracao.md` (intents, escopos `bot` e `applications.commands`, permissões Ver canais, Enviar mensagens e Ver histórico de mensagens, URL de convite).
- [X] **Canais de entrada** (`#planejamento`, `#insights`, `#cobrancas`, `#pessoas`): criar, pôr os IDs no `.env` (`DISCORD_CANAL_PLANEJAMENTO`, `_INSIGHTS`, `_COBRANCAS`, `_PESSOAS`) e reiniciar a ponte.
- [X] **Tópico dos canais:** copiar de `docs/discord-canais.md` o texto de cada canal para o campo Tópico (até 1024 caracteres, todos cabem).
- [ ] **Cadastrar as rotinas no Grok Bot:** siga `grok/rotinas/README.md` (tabela com horários, conectores e ordem). Planejamento e Captura rodam 6x ao dia (8h, 10h, 12h, 14h, 16h, 18h).
- [ ] **Testar os comandos `/`:** `/tarefa` e `/marcos` em `#planejamento`, `/insight` em `#insights`, `/cobrar` em `#cobrancas`, `/pessoa` em `#pessoas`. Respondem na hora, sem rotina.
- [ ] **Testar a conversa:** escreva em `#planejamento` "regras do próximo marco do fiscal: confiança 95, janela de 8 semanas, escopo fechado" e depois "a tag é <tag>, entrega em <data>"; na próxima execução o Copiloto responde o que registrou.
- [ ] **Regras dos marcos:** hoje as regras são confiança (percentil), janela de histórico, tipos, escopo fechado e uma observação em texto livre. Diga se há outras regras que você define a cada marco (por exemplo limite de WIP, itens que não podem entrar, dia de congelamento) para virarem regras de verdade.
- [ ] **DORA (T1.12):** frequência de deploy e lead time de mudanças precisam dos pipelines do Azure DevOps. Diga qual pipeline (ou ambiente) representa produção em cada time e, ao criar o PAT, inclua **Build (Read)** e **Release (Read)**.
- [X] **Limites de alerta:** padrões atuais: envelhecimento 7 dias, bloqueio 2 dias úteis, WIP 3 por pessoa, bug rate 10%, commit parado 3 dias úteis. Anote os diferentes e eles viram variáveis no `.env`.
- [ ] **Limites de alerta:** revisar a lista de métricas em `docs/plano.md` e anotar limites diferentes dos padrões, se houver.
- [x] **Ligar o Azure DevOps na ponte** (passo 8 de `docs/conectar.md`) e comparar `boards_saude` com o board real.
- [ ] **Cadastrar as rotinas** de `grok/rotinas/` no Grok Bot: briefing diário (7h30), resumo semanal (sexta, 16h), observador (opcional).
- [ ] **Gate:** durante 2 semanas, anotar todo dia se o briefing foi útil (meta: 4 de 5 dias).
- [ ] **Testar o botão de tarefas no Discord:** peça ao Grok Bot para chamar `tarefas_postar`, clique em "✔ #id" e confirme que a tarefa fica riscada. Precisa do bot do Discord ligado (mesma configuração da fila de aprovações).
- [ ] **Métricas por colaborador:** testar `metricas_colaboradores` do time fiscal e conferir os números com o board. Dado restrito: use no app do Grok Bot, não em canal compartilhado do Discord.

## Fase 2 (reuniões e pessoas): decisões e material para destravar

Detalhes em `docs/backlog-fase-2.md` (T2.0, T2.3, T2.12). Pode adiantar enquanto a fase 1 roda.

- [x] **Embeddings da busca por significado:** respondido em 22/10/2026: **local**. (pergunta original: modelo **local** na sua máquina (nada sai dela; recomendado por causa de PDI e 1:1) ou **API** (mais simples; o texto das notas vai ao provedor)?)
- [~] **Reunião dispensável ou delegável:** respondido em 23/10/2026: não há critérios para dispensar ou delegar; a ideia é **convidar** (sugerir quem deve estar na reunião). As dailies o Paulo gosta de acompanhar; quando não for, o plano é ler a transcrição e agir depois (fase 3). Falta confirmar o sentido de "convidar". (pergunta original: quais critérios valem (sem pauta, sem decisão nas últimas ocorrências, você não é o decisor, só informativa…)
- [x] **Como o Copiloto reconhece na agenda:** respondido em 22/10/2026: 1:1 aparece como "Feedback 1:1 - [Colaborador]"; reunião com o CTO pode conter "Saulo/Paulo" no título, mas costuma ser desmarcada e sem novos eventos (o Paulo também pode agendar). (pergunta original: um 1:1 (título com "1:1"? só dois participantes?), a reunião com o CTO (título? e-mail do CTO?) e em que semanas ela cai.)
- [x] **Cadência de 1:1 por pessoa:** 1:1 **mensal** (22/10/2026); revisão do PDI **a cada 6 meses** (23/10/2026). (pergunta original: (semanal, quinzenal…) e a cada quanto tempo revisar o PDI.)
- [x] **Tech Lead:** `papel_ler` conferido pelo Paulo em 23/10/2026 (`avisos` vazio). Falta conferir o Scrum Master.
- [x] **Planos por papel:** material de **Tech Lead** e **Scrum Master** enviado em 22/10/2026; v1 montada em `vault-template/papeis/`.
- [ ] **Revisar os planos de Tech Lead e Scrum Master:** copiar `vault-template/papeis/tech-lead.md` e `scrum-master.md` para `papeis/` do vault, ajustar os níveis propostos (o material não define níveis nem cargos), completar o que está como `[a completar]` (cargos e critérios de promoção) e marcar `revisado: true`. Depois rodar `papel_ler` para conferir (T2.3 e T2.12).
- [ ] **Persona v1:** copiar o texto integral para `persona/guia-de-estilo.md` no vault privado, revisar, marcar `revisado: true` e completar o que está como `[a completar]` (feedback do CTO e do time, emoji por canal, cadência dos hábitos, aula 11, Pentad de Burke e Triple Threat). O Coach e a pauta do CTO dependem dele.
- [x] **Busca por significado (T2.1):** validado pelo Paulo em 22/10/2026 (`npm run indexar -- --buscar` devolveu a nota certa). Passos feitos: na máquina da ponte, `npm install @huggingface/transformers`, pôr `EMBEDDER=local` no `.env` e reiniciar; rodar `npm run indexar` (a primeira indexação baixa o modelo, ~120 MB, e pode demorar; dá para deixar para a noite). Depois testar `vault_buscar_semantico` com uma pergunta cuja resposta use outras palavras que a nota e dizer se os resultados fazem sentido.
- [ ] **Perfis para os lembretes de 1:1 (T2.5):** para cada pessoa que você faz 1:1, crie `pessoas/<nome>/perfil.md` a partir de `vault-template/pessoas/_modelo-perfil.md` (campos `pessoa` e `cadencia_1x1`: semanal, quinzenal, mensal… ou "45 dias") e guarde cada 1:1 em `pessoas/<nome>/1x1/AAAA-MM-DD-1x1.md`. Sem perfil, vale a cadência mensal. Depois peça ao Grok para chamar `um_a_um_pendentes`.
- [ ] **Importador:** rodar na pasta de colaboradores, `--simular` primeiro (T2.12).

## Respostas já registradas

- Repositórios do Squad Fiscal e do Retaguarda WEB: projeto Metanet.
- Bug de produção: tipo **Bug Externo**. Bug rate essencial abaixo de 10%; MTTR por tendência.
- Pasta de colaboradores: local, markdown separado em pastas.
- Planos por papel: Tech Lead e Scrum Master primeiro.
- CTO: reunião quinzenal; evoluções primeiro, decisões e pontos de atenção levados cedo.
- Domínio de e-mail da empresa: imex.com.br (23/10/2026); participante de outro domínio é externo.
- PDI: revisão a cada 6 meses (23/10/2026).
- Embeddings: modelo local (22/10/2026).
- 1:1: cadência mensal; título na agenda "Feedback 1:1 - [Colaborador]" (22/10/2026).
- CTO: título pode conter "Saulo/Paulo", mas a reunião quase sempre é desmarcada e não há eventos novos; o insumo deve estar pronto **pelo menos a cada 15 dias**, com ou sem evento (22/10/2026).
- Hospedagem: ponte na sua máquina; Grok Bot na nuvem.

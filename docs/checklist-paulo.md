# Checklist do Paulo

O que só você pode fazer, porque depende das suas contas ou da sua máquina. Marque conforme avança; as sessões de desenvolvimento leem este arquivo.

## Antes de começar (fase 0)

- [ ] **Linguagem da ponte** (tarefa T0.1): .NET 10 ou TypeScript. Se for .NET, liberar `api.nuget.org` e `globalcdn.nuget.org` em claude.ai → Settings → Capabilities, para a sessão na nuvem baixar pacotes.
- [ ] **Grok Bot:** confirmar que o seu plano do Cursor inclui o Grok Bot (Ultra ou Premium Teams).
- [ ] **Conectores do Google no Grok Bot:** em grok.com/connectors, ligar Gmail, Calendar e Drive com a conta da empresa e confirmar que funcionam.
- [ ] **Transcrição do Meet:** verificar se a transcrição de reuniões está ativa no Workspace da empresa.
- [ ] **Discord:**
  - [ ] Criar um servidor privado só seu, com verificação em duas etapas na sua conta.
  - [ ] Criar os canais: `#briefing`, `#alertas`, `#aprovacoes`, `#reunioes`, `#pessoas`, `#cto`.
  - [ ] Criar a aplicação e o bot no Discord Developer Portal, copiar o token (guardar fora do Git) e convidar o bot para o servidor.
  - [ ] Anotar o seu ID de usuário no Discord (único autorizado a aprovar).
- [ ] **Vault:**
  - [ ] Escolher a pasta do vault novo na sua máquina.
  - [ ] Criar um repositório GitHub **privado e separado** para o vault (nunca usar este repositório para dados de pessoas).
  - [ ] Informar o caminho da pasta atual de colaboradores, para o importador.
- [ ] **Persona:** reunir o material sobre como você quer se portar como líder e entregar um compilado para o Claude interpretar e montar a persona (v1 do `guia-de-estilo.md` e da skill `grok/skills/persona.md`).
  - [ ] Compilado com referências de postura e liderança que você quer seguir (textos, livros, anotações, feedbacks recebidos).
  - [ ] De 5 a 10 mensagens reais suas: algumas que representam bem o estilo que você quer e algumas que não (anonimizadas, sem dados sigilosos).
  - [ ] Depois da v1: revisar, copiar para `persona/guia-de-estilo.md` do vault real e trocar `revisado: false` por `true`.
  - Pendente do Paulo: o guia atual é só rascunho, com exemplos vazios (T0.10 aguarda esta revisão).
- [ ] **Máquina:** instalar o SDK da linguagem escolhida e a ferramenta de túnel (por exemplo `cloudflared`).

## Fase 1

- [ ] **Token do Azure DevOps:** criar um Personal Access Token na organização `metanetsistema` com escopo **somente leitura**: Work Items (Read), Code (Read), Analytics (Read). Guardar só no `.env` da sua máquina.
  - Um PAT colado em conversa deve ser **revogado e recriado**: ele já passou por um canal que guarda histórico. A sessão na nuvem não usa o PAT (não alcança o Azure DevOps).
- [ ] **Confirmar a estrutura do Azure DevOps.** Só User Story e Bug entram nas métricas (Feature, Épico e Atendimento ficam de fora); o nome exato do tipo é `User Story`, ou ajuste `AZDO_TIPOS`. Já respondido em 21/10/2026: área `Metanet\Squad Desktop`, bloqueio = campo Paralisado, bug de produção = campo Tipo Bug "Bug Externo". Falta:
  - [x] Nome técnico do campo Tipo Bug: `Custom.TipoBug` (confirmado em 21/10/2026).
  - [x] Respondido: lead de Backlog a Concluído; cycle de Fazendo Análise a Pronto pra release (Resolved); Ideias e UX fora; Fiscal sem Release candidate; throughput só em Concluído.
  - [ ] Depois da primeira sincronização, conferir `fonte.colunasDesconhecidas` em `boards_saude`: se aparecer algum nome, é coluna que o código não reconheceu (a comparação ignora maiúsculas, acentos e espaços, então seria outra grafia ou outra coluna). Me diga o nome exato.
  - [ ] Campo de pontos: usei `StoryPoints` e, na falta, `Effort`.
- [ ] **Registrar os marcos de entrega em andamento:** peça ao Grok Bot `boards_tags` (mostra as tags dos itens abertos) e depois `marco_registrar` com o nome, a tag e a data de cada marco. Quando a data mudar, `marco_atualizar` (assim o adiamento fica registrado). O risco é uma estimativa; diga se a regra (itens abertos x ritmo das últimas 8 semanas) faz sentido ou se prefere outra.
- [ ] **Limites de alerta:** padrões atuais: envelhecimento 7 dias, bloqueio 2 dias úteis, WIP 3 por pessoa, bug rate 10%, commit parado 3 dias úteis. Anote os diferentes e eles viram variáveis no `.env`.
- [ ] **Ligar o Azure DevOps na ponte** (passo 8 de `docs/conectar.md`) e comparar `boards_saude` com o board real.
- [ ] **Cadastrar as rotinas** de `grok/rotinas/` no Grok Bot: briefing diário (7h30), resumo semanal (sexta, 16h), observador (opcional).
- [ ] **Gate:** durante 2 semanas, anotar todo dia se o briefing foi útil (meta: 4 de 5 dias).
- [ ] **Testar o botão de tarefas no Discord:** peça ao Grok Bot para chamar `tarefas_postar`, clique em "✔ #id" e confirme que a tarefa fica riscada. Precisa do bot do Discord ligado (mesma configuração da fila de aprovações).
- [ ] **Métricas por colaborador:** testar `metricas_colaboradores` do time fiscal e conferir os números com o board. Dado restrito: use no app do Grok Bot, não em canal compartilhado do Discord.

## Respostas já registradas

- Repositórios do Squad Fiscal e do Retaguarda WEB: projeto Metanet.
- Bug de produção: campo **Tipo Bug** = "Bug Externo" (o outro valor é "Bug Interno"). Bug rate essencial abaixo de 10%; MTTR por tendência.
- Pasta de colaboradores: local, markdown separado em pastas.
- Planos por papel: Tech Lead e Scrum Master primeiro.
- CTO: reunião quinzenal; evoluções primeiro, decisões e pontos de atenção levados cedo.
- Hospedagem: ponte na sua máquina; Grok Bot na nuvem.

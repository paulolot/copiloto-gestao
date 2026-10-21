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

## Fase 1 (adiantar se quiser)

- [ ] **Token do Azure DevOps:** criar um Personal Access Token na organização `metanetsistema` com escopo **somente leitura**: Work Items (Read), Code (Read), Analytics (Read). Guardar fora do Git.
- [ ] **Limites de alerta:** revisar a lista de métricas em `docs/plano.md` e anotar limites diferentes dos padrões, se houver.

## Respostas já registradas

- Repositórios do Squad Fiscal e do Retaguarda WEB: projeto Metanet.
- Bug de produção: tipo **Bug Externo**. Bug rate essencial abaixo de 10%; MTTR por tendência.
- Pasta de colaboradores: local, markdown separado em pastas.
- Planos por papel: Tech Lead e Scrum Master primeiro.
- CTO: reunião quinzenal; evoluções primeiro, decisões e pontos de atenção levados cedo.
- Hospedagem: ponte na sua máquina; Grok Bot na nuvem.

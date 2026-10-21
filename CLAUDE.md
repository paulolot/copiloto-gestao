# Copiloto Gestão — contexto para sessões de desenvolvimento

Este repositório constrói o **Copiloto Gestão**: agentes de IA que executam o ciclo de trabalho de um coordenador de desenvolvimento (Paulo, Meta Sistemas). Leia este arquivo inteiro antes de começar qualquer tarefa.

## Onde está cada coisa

| Arquivo | Conteúdo |
| --- | --- |
| `docs/plano.md` | Visão, arquitetura, decisões, escopo, métricas, autonomia, persona, reunião com o CTO e fases |
| `docs/requisitos.md` | Requisitos funcionais (RF-01 a RF-37) e não funcionais (RNF-01 a RNF-12), com fase |
| `docs/backlog-fase-1.md` | Tarefas da fase atual (fase 1: boards e rotina), em ordem, com critério de pronto. A fase 0 está em `docs/backlog-fase-0.md` (concluída) |
| `docs/checklist-paulo.md` | O que só o Paulo pode fazer (contas, tokens, configuração do Grok Bot) |

O plano completo e editável também existe como documento no claude.ai: https://claude.ai/artifact/CqqDCb6gjt4RmrCQFFxUDQ (privado do Paulo). Em caso de conflito, o documento no claude.ai vale mais que `docs/plano.md`.

## Arquitetura em uma frase

O **Grok Bot** (nuvem, incluído no plano do Cursor do Paulo) é o cérebro: os agentes são rotinas agendadas e skills dele, e ele lê Gmail, Calendar e Drive pelos conectores nativos. Este repositório constrói o resto:

1. **Ponte MCP** (`src/`): servidor MCP que o Grok Bot chama por um túnel seguro. Dá acesso ao Azure DevOps, ao vault, ao Discord e à fila de aprovações, e impõe a política de autonomia e o log de auditoria. Roda na máquina do Paulo.
2. **Extensão do Chrome** (`extension/`): lê as legendas (ou o áudio) do Google Meet e envia a transcrição à ponte.
3. **Conteúdo do Grok Bot** (`grok/`): textos das skills e das rotinas (persona, Coach, Porta-voz, briefing etc.), versionados aqui e colados no Grok Bot pelo Paulo.
4. **Modelo do vault** (`vault-template/`) e **importador** da pasta de colaboradores.

## Regras que não mudam

- **Nunca** versionar segredos (tokens, chaves, `.env`, `appsettings.*.local.json`) nem conteúdo do vault real. O vault tem PDI, 1:1 e notas sobre pessoas; ele vive fora deste repositório.
- **Ferramentas de escrita da ponte não agem direto.** Tudo que chega a outra pessoa ou altera um board (mensagem, e-mail, work item, comentário) vira um item na fila de aprovações e só é executado depois do OK do Paulo no Discord. A política está em `docs/plano.md`, seção Política de autonomia.
- **Toda chamada de ferramenta é registrada** no log de auditoria: ferramenta, parâmetros (sem segredos), quem chamou, resultado, horário.
- **Toda resposta cita a fonte** (work item, commit, nota do vault, e-mail).
- **Métricas são por time, nunca ranking individual de pessoas.**
- **Área restrita do vault** (`pessoas/`, PDI, 1:1): só sai da ponte quando a ferramenta é específica para isso; nunca em canais compartilhados do Discord.
- Código, nomes de classes e commits em **inglês**; documentação, textos de skills e mensagens ao usuário em **português do Brasil**.

## Ambiente da sessão na nuvem

- A sessão na nuvem **não alcança** `dev.azure.com`, as APIs do Google, o Discord nem a máquina do Paulo. Testes usam **dados simulados** (fixtures em `tests/fixtures/`), e as integrações reais são validadas pelo Paulo na máquina dele.
- **Linguagem da ponte:** TypeScript/Node 22 (decisão registrada em 21/10/2026 — NuGet bloqueado na nuvem; npm funciona normalmente).
- SDK oficial de MCP: `@modelcontextprotocol/sdk`; Discord: `discord.js`.

## Como trabalhar

1. Pegue a próxima tarefa aberta em `docs/backlog-fase-1.md`, respeitando a ordem e as dependências.
2. Implemente com testes. Rode os testes antes de dar a tarefa como pronta.
3. Marque a tarefa como feita no backlog (`- [x]`) no mesmo commit.
4. Se algo depende do Paulo, registre em `docs/checklist-paulo.md` em vez de inventar valores.
5. Commits pequenos, um por tarefa, mensagem em inglês no imperativo.

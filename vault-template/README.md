# Vault — Copiloto Gestão

Este vault é a memória do Paulo como gestor de times de desenvolvimento de software. Ele vive num **repositório Git privado e separado** deste repositório (`copiloto-gestao`). Nunca misture os dois.

## Estrutura

| Pasta | Conteúdo | Acesso |
| --- | --- | --- |
| `inbox/` | Notas criadas pelo Copiloto, ainda não revisadas (`revisado: false`) | Aberto |
| `reunioes/` | Notas de reunião: pauta, decisões, próximos passos | Aberto |
| `decisoes/` | Decisões com contexto e o porquê | Aberto |
| `times/` | Contexto dos times (Squad Fiscal, Desktop, Retaguarda WEB) | Aberto |
| `produtos/` | Contexto dos produtos e repositórios | Aberto |
| `pessoas/` | PDI, 1:1, feedbacks, perfis — **área restrita** | Restrito |
| `papeis/` | Planos de papel (Tech Lead, Scrum Master…) | Aberto |
| `cto/` | Pautas e registros da reunião quinzenal com o CTO | Aberto |
| `persona/` | Guia de estilo e persona de liderança do Paulo | Aberto |
| `conquistas/` | Registro contínuo de conquistas do Paulo e do time | Aberto |

## Regras

- **`pessoas/` é restrita:** nunca sincronize em canais compartilhados; o Copiloto só acessa quando a tarefa exige explicitamente.
- **`inbox/` é rascunho:** toda nota gerada pelo Copiloto tem `revisado: false`. Revise e mova para a pasta correta.
- **Fonte obrigatória:** toda nota cita de onde veio a informação (`fonte:` no frontmatter).
- **Markdown puro:** o vault abre no Obsidian sem plugins obrigatórios.

## Frontmatter padrão

```yaml
---
tipo: reuniao         # reuniao | decisao | pessoa | atencao | conquista | plano
titulo: "Título"
data: 2026-10-21
fonte:
  - "Google Meet"
  - "work item #1234"
pessoas: []           # nomes ou IDs
times: []             # Squad Fiscal | Squad Desktop | Retaguarda WEB
revisado: false       # true depois da revisão do Paulo
origem: copiloto      # copiloto | manual | importado
---
```

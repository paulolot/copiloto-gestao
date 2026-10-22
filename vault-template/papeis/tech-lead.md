---
tipo: plano
titulo: "Plano de papel — Tech Lead"
papel: "Tech Lead"
data: 2026-10-22
niveis:
  - "Em desenvolvimento"
  - "Consolidado"
  - "Referência"
fonte:
  - "Guia de Execução — Tech Lead (material do Paulo, 22/10/2026)"
  - "Insight de Gestão e Engenharia (material do Paulo, 22/10/2026)"
revisado: false
origem: copiloto
---

> **Rascunho v1 montado pelo Claude a partir do material do Paulo.** O guia não define níveis nem cargos: os três níveis e a trilha abaixo são uma proposta derivada da "Definition of Done" e dos anti-padrões do guia. Tudo o que está marcado como *(proposta)* ou *[a completar]* precisa da sua revisão antes de `revisado: true`.

## Missão

Garantir excelência técnica, arquitetura, padrões, qualidade e evolução da engenharia, orientando desenvolvedores, antecipando riscos e distribuindo conhecimento. Decisões estruturantes são alinhadas com o Coordenador quando impactam prioridade, risco, custo, roadmap ou outras equipes.

**Princípio central:** o Tech Lead não é o herói que resolve tudo. É o guardião das condições técnicas que permitem ao time encontrar, decidir, implementar, revisar e aprender sem depender de uma única pessoa. Senioridade concentra as decisões difíceis, não todas as decisões.

## Competências

- **Direção técnica** — define padrões e decisões reutilizáveis (guia técnico, ADRs, guardrails) e registra as decisões.
- **Qualidade e code review educativo** — o review protege a qualidade e ensina: corrige o imediato, explica o princípio e, se o problema se repete, vira padrão, checklist, automação ou treinamento.
- **Mentoria e autonomia** — pairing, feedback técnico e tech talks para que o time decida sozinho; distribui a revisão para formar novas referências.
- **Risco e dívida técnica** — mapeia hotspots, dependências e dívida, classificando por risco, custo de mudança, frequência, concentração de conhecimento e impacto no roadmap; conecta dívida ao resultado do produto.
- **Fluxo técnico** — avalia tecnicamente os cards e apoia o refinamento para que os riscos apareçam antes da execução.
- **Liderança por sinais** — usa dados para localizar condições de engenharia, nunca para ranquear pessoas. Sequência: resultado da entrega → sinal → hipótese → investigação técnica → intervenção → verificação.
- **Capacidade instalada** — depois de resolver um problema, pergunta o que muda para ele aparecer antes, ser resolvido por outra pessoa ou não voltar (teste, alerta, guardrail, padrão, refatoração de fronteira, distribuição de conhecimento, decisão registrada).
- **Decisão no nível certo** — decide o que é local e dentro de padrão; define e comunica novos padrões da squad; analisa alternativas e alinha com o Coordenador o que é arquitetural ou afeta roadmap e custo; **não** decide prioridade de backlog nem escopo de produto (fornece o impacto técnico).

## Cadência

| Cadência | Atividade | Pergunta-chave |
| --- | --- | --- |
| Diária | Acompanhar exceções técnicas relevantes | Existe risco que pode comprometer a entrega? |
| Semanal | Pairing e mentoria | Quem precisa de contexto para decidir sozinho depois? |
| Semanal | Revisão de riscos e dívidas | O que está ficando mais caro de mudar? |
| Semanal | Leitura de PRs como amostra | Qual padrão está se repetindo? |
| Quinzenal | Tech talk ou sessão de engenharia | Que conhecimento precisa ser distribuído? |
| Quinzenal | Revisão com o Scrum Master | Há gargalo técnico recorrente no fluxo? |
| Mensal | Revisão com o Coordenador | Quais riscos técnicos exigem prioridade ou decisão? |
| Trimestral | Maturidade e sucessão | Quem pode assumir responsabilidades técnicas? |

## Sinais que o papel acompanha

| Sinal | O que pode indicar | Próxima investigação |
| --- | --- | --- |
| Change Failure Rate alto | Instabilidade | Tipo de mudança, testes, deploy, acoplamento |
| Cycle Time P85 alto | Fila ou complexidade | Tempo por etapa e dependências |
| Hotspot | Concentração de mudança | Criticidade, testes, complexidade |
| Ownership concentrado | Risco de continuidade | Quem conhece, quem revisa, distribuição |
| Co-mudança recorrente | Fronteira frágil | Dependências e arquitetura prática |
| PRs reprovados repetidamente | Padrão de qualidade ausente | Guia, checklist, mentoria, design |

Nenhum indicador isolado explica uma causa: o sinal indica onde investigar.

## Expectativas por nível

Os níveis abaixo são uma *(proposta)* que mede o quanto o time depende do próprio Tech Lead, que é o critério de "pronto" do guia. **[a completar]** com os cargos e senioridades reais da empresa, se existirem.

### Em desenvolvimento

- Cumpre a cadência semanal e decide bem dentro dos padrões existentes.
- Ainda é o revisor principal de áreas importantes e resolve diretamente a maior parte dos problemas técnicos.
- Traz ao Coordenador os riscos que identifica, mas nem sempre com alternativas e recomendação.
- Usa os sinais do board para perguntar "o que mudou?", sem apontar pessoas.

### Consolidado

- Registra decisões e transforma erros recorrentes em padrão, checklist ou automação.
- Distribui o review: há mais de um revisor capaz nas áreas críticas.
- Leva ao Coordenador decisões com problema, alternativas, recomendação, risco e o que acontece se nada for decidido.
- Mantém um mapa de riscos e dívida priorizado e conectado ao roadmap.

### Referência

- O time decide as questões recorrentes sem ele; os guardrails substituem a intervenção.
- Conhecimento crítico está distribuído e há sucessores identificados para as responsabilidades técnicas.
- Usa os sinais de forma sistemática (baseline, divergência, hipótese, menor intervenção, verificação) e deixa capacidade instalada depois de cada intervenção.
- Forma outros líderes técnicos e apoia outras squads.

## Trilha de crescimento

*(proposta, derivada do guia; confirmar com o Paulo)*

1. **Especialista que resolve** — referência técnica do time, ainda concentra decisões e revisões.
2. **Guardião de padrões** — transforma o que resolve em padrões, ADRs e checklists.
3. **Construtor de capacidade** — distribui conhecimento e revisão; o time decide sem ele.
4. **Preparador de sucessão** — identifica e desenvolve quem pode assumir responsabilidades técnicas; pode apoiar outras squads.

O que costuma destravar cada passo: parar de ser o único revisor, registrar decisões, delegar progressivamente e medir a própria dependência operacional ao longo do tempo. **[a completar]** o caminho formal de carreira (cargos, critérios de promoção).

## Sinais de que a pessoa está pronta

Evidências que o Paulo olha antes de propor a próxima etapa (observáveis, com fonte):

- Existem padrões claros e os riscos aparecem antes de virar atraso (work items, mapa de riscos).
- A qualidade melhora sem depender de heroísmo: menos regressão e menos PRs reprovados pelo mesmo motivo (PRs, bugs externos).
- Mais de uma pessoa revisa e entende as áreas críticas (distribuição de review e de ownership).
- Decisões recorrentes são tomadas pelo time (1:1, relato do time, registros de decisão).
- O teste das férias passa: se o Tech Lead ficar duas semanas fora, o time continua decidindo e entregando.
- A dependência operacional do próprio Tech Lead diminui ao longo do tempo (comparar trimestres).

## Perguntas para os 1:1 e a revisão mensal

- Onde seu time está mais vulnerável? Onde você é o gargalo?
- Qual conhecimento está concentrado em uma pessoa?
- Qual problema você resolve repetidamente, e o que está fazendo para ele deixar de existir?
- Qual problema você resolveu esta semana que deveria deixar de existir?
- Qual decisão o time ainda depende de você para tomar?
- Qual parte do sistema está tornando as mudanças mais caras?

## Anti-padrões

- Ser o único revisor de PRs importantes ou a única pessoa que conhece uma área crítica.
- Resolver toda decisão técnica sem criar guardrails.
- Usar commits e PRs como ranking de produtividade; confundir atividade técnica com valor entregue.
- Acumular dívida técnica sem conectá-la ao impacto no produto.
- Intervir diretamente em tudo que está tecnicamente errado.
- Ser indispensável para o time continuar funcionando.

## Definition of Done do papel

O Tech Lead cumpre o papel quando a engenharia tem padrões claros, os riscos aparecem antes, a qualidade melhora sem depender de heroísmo, o conhecimento crítico é distribuído, as decisões recorrentes podem ser tomadas pelo time e a dependência operacional do próprio Tech Lead diminui ao longo do tempo.

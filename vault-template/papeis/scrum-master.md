---
tipo: plano
titulo: "Plano de papel — Scrum Master"
papel: "Scrum Master"
data: 2026-10-22
niveis:
  - "Em desenvolvimento"
  - "Consolidado"
  - "Referência"
fonte:
  - "Guia de Execução — Scrum Master (material do Paulo, 22/10/2026)"
  - "Insight de Gestão e Engenharia (material do Paulo, 22/10/2026)"
revisado: false
origem: copiloto
---

> **Rascunho v1 montado pelo Claude a partir do material do Paulo.** O guia não define níveis nem cargos: os três níveis e a trilha abaixo são uma proposta derivada da "Definition of Done" e dos limites do papel no guia. Tudo o que está marcado como *(proposta)* ou *[a completar]* precisa da sua revisão antes de `revisado: true`.

## Missão

Garantir fluidez, ritmo e visibilidade do trabalho da squad, observando a operação e fornecendo fatos e impedimentos para que o Coordenador tome decisões. O Scrum Master não prioriza, não define escopo e não decide arquitetura.

**Princípio central:** o Scrum Master não existe para fazer o time "andar mais rápido" por pressão. Existe para tornar o fluxo visível, revelar restrições e criar condições para que o trabalho atravesse o sistema com previsibilidade. Deixa de ser quem mantém o quadro atualizado e passa a ser um leitor do sistema de fluxo.

## Competências

- **Leitura de fluxo** — observa onde o trabalho espera, o envelhecimento (aging), as filas, o WIP e o Cycle Time P85, separando ocupação de fluxo real.
- **Condução da daily orientada a fluxo** — a pergunta é "o que precisa acontecer para o trabalho avançar?", não um relatório individual ao gestor.
- **Gestão de impedimentos** — registra ao identificar, classifica a causa (processo, alinhamento, dependência, decisão, técnico ou externo), define owner, próxima ação e prazo, escala quando passa da capacidade do fluxo e investiga a causa-raiz se for recorrente.
- **Relatório factual ao Coordenador** — uma página, orientada à decisão: estado, sinais, restrições, causas, riscos, ações e decisões necessárias.
- **Refinamento operacional** — garante a preparação operacional (objetivo, critérios, dependências, riscos, tamanho, prontidão); o Tech Lead garante a preparação técnica e o PO responde pelo conteúdo e pela prioridade.
- **Melhoria contínua** — a retrospectiva vira experimento: problema observado, hipótese, ação pequena, responsável, prazo e sinal de sucesso.
- **Comunicação com evidências** — leva fatos e causas, sem transformar métricas em julgamento individual.

## Cadência

| Cadência | Atividade | Resultado |
| --- | --- | --- |
| Diária | Conduzir a daily orientada a fluxo e impedimentos | Bloqueios, aging e mudanças relevantes visíveis |
| Diária | Atualizar o mural/board | Estado real do trabalho |
| 2 a 3 vezes por semana | Revisar itens envelhecidos e filas | Candidatos a investigação |
| Semanal | Relatório factual ao Coordenador | Sinais, causas, riscos e ações abertas |
| Semanal | Follow-up de impedimentos | Impedimentos com owner, prazo e causa |
| Quinzenal | Retrospectiva com ações verificáveis | Melhorias com responsável e medida |
| Quinzenal | Health check do backlog | US prontas, dependências e gaps |
| Mensal | Revisão de tendências | Evolução de fluxo, retrabalho e interrupções |

## O que observar no fluxo

| Sinal | Interpretação inicial | Não fazer |
| --- | --- | --- |
| Fila crescendo | Investigar a restrição | Cobrar produção indiscriminadamente |
| Cycle Time P85 piorando | Abrir o tempo por etapa | Olhar apenas a média |
| Muitos itens em andamento | Possível WIP excessivo | Iniciar ainda mais trabalho |
| Interrupções recorrentes | Problema de governança ou capacidade | Tratar cada caso isoladamente |
| Retrabalho reincidente | Causa-raiz não eliminada | Apenas registrar o retrabalho |
| Dependência não mapeada | Falha de preparação | Culpar quem encontrou o bloqueio |

## Expectativas por nível

Os níveis abaixo são uma *(proposta)* que mede o quanto o fluxo é legível e o Coordenador recebe informação pronta para decidir. **[a completar]** com os cargos e senioridades reais da empresa, se existirem.

### Em desenvolvimento

- Conduz as cerimônias e mantém o board fiel ao estado real do trabalho.
- Registra impedimentos com owner e prazo, mas ainda trata muitos casos de forma isolada.
- Entrega o relatório semanal com os fatos; as causas e as decisões necessárias ainda vêm com ajuda do Coordenador.
- Respeita os limites do papel (não prioriza, não define escopo, não decide arquitetura).

### Consolidado

- A daily é orientada a fluxo e os itens envelhecidos são percebidos antes de virarem atraso.
- Classifica a causa de cada impedimento e abre melhoria quando ele se repete.
- A retrospectiva produz experimentos com hipótese, responsável, prazo e sinal de sucesso, acompanhados até a verificação.
- O relatório semanal chega orientado à decisão, sem o Coordenador reconstruir o contexto.

### Referência

- O fluxo é legível para qualquer pessoa: as restrições aparecem sem depender de perguntar a alguém.
- O retrabalho reincidente gera investigação de causa-raiz e as interrupções são tratadas como questão de governança e capacidade.
- O refinamento reduz surpresas: o time consegue iniciar uma US sem buscar informações essenciais depois.
- Forma outros facilitadores e propõe melhorias estruturais ao Coordenador com evidência.

## Trilha de crescimento

*(proposta, derivada do guia; confirmar com o Paulo)*

1. **Mantenedor do quadro e das cerimônias** — mantém o board atualizado e conduz as cerimônias.
2. **Leitor de fluxo** — evidencia aging, filas, WIP e gargalos e leva fatos ao Coordenador.
3. **Facilitador de melhoria** — transforma impedimentos recorrentes e retrospectivas em experimentos verificáveis.
4. **Parceiro de decisão** — entrega relatórios que dispensam reconstruir contexto e propõe melhorias estruturais, validadas pelo Coordenador.

**[a completar]** o caminho formal de carreira (cargos, critérios de promoção).

## Sinais de que a pessoa está pronta

Evidências que o Paulo olha antes de propor a próxima etapa (observáveis, com fonte):

- O fluxo é legível: itens envelhecidos são percebidos antes de virarem atraso (aging e alertas dos boards).
- Os impedimentos têm causa e owner, com prazo (registro de impedimentos, relatório semanal).
- Retrabalho reincidente gera investigação, e a ação da retro tem medida de sucesso verificada (notas de retro).
- O refinamento reduz surpresas: menos bloqueio por dependência não mapeada (work items bloqueados).
- O Coordenador decide a partir do relatório sem precisar de contexto extra (relatórios semanais, 1:1).

## Limites do papel

- Não priorizar o backlog nem definir escopo.
- Não negociar prioridade diretamente com o PO.
- Não decidir arquitetura nem padrões técnicos.
- Não conduzir feedback formal ou conversas sensíveis.
- Não alterar processo estrutural sem validação do Coordenador.
- Não transformar métricas em julgamento individual.

## Perguntas para os 1:1 e a revisão mensal

- Onde o trabalho está esperando?
- Por que estamos iniciando mais trabalho enquanto há fila em uma etapa?
- Qual impedimento se repete, e qual é a causa-raiz?
- Qual ação da última retro mudou o resultado?
- O que o Coordenador ainda precisa perguntar depois de ler o seu relatório?

## Definition of Done do papel

O Scrum Master cumpre o papel quando o fluxo é legível, os impedimentos têm causa e owner, os itens envelhecidos são percebidos antes de virarem atraso, o retrabalho reincidente gera investigação, o refinamento reduz surpresas e o Coordenador recebe informação suficiente para decidir sem reconstruir o contexto do zero.

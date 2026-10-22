# Requisitos

Um requisito só é dado como pronto quando o Paulo o usa no dia a dia por uma semana. "Onde" indica quem implementa: **Ponte** (este repositório, `src/`), **Grok** (rotina ou skill em `grok/`, configurada no Grok Bot), **Extensão** (`extension/`) ou **Vault**.

## Funcionais

### Boards, código e métricas

| ID | Requisito | Fase | Onde |
| --- | --- | --- | --- |
| RF-01 | Ler User Stories e Bugs dos três area paths a cada hora (sem sprints: o acompanhamento é por marco de entrega, registrado com uma tag) | 1 | Ponte |
| RF-02 | Ler commits e pull requests dos repositórios do escopo | 1 | Ponte |
| RF-03 | Calcular as métricas por time, por semana e por mês, guardando o histórico | 1 | Ponte |
| RF-04 | Alertar quando uma métrica sai do limite; sem limite, usar desvio contra a linha de base de 8 semanas | 1 | Ponte + Grok |
| RF-05 | Apontar itens parados, bloqueados, sem dono ou sem estimativa | 1 | Ponte |
| RF-06 | Métricas por time, sem ranking nem comparação entre pessoas; o nome do dono do card e de quem está com WIP acima do limite pode aparecer nos canais (decisão de 22/10/2026); métricas individuais completas só em ferramenta específica (1:1 e PDI) | 1 | Ponte |
| RF-38 | Definir por conversa no Discord (`#planejamento`) os marcos de entrega e as regras do próximo marco de cada time, a qualquer momento | 1 | Ponte + Grok |
| RF-39 | Previsão de entrega por percentis (simulação de Monte Carlo), sem média; cycle e lead time em P50/P85/P95 | 1 | Ponte |
| RF-40 | Captura por Discord: insights do dia, impressões e conversas privadas sobre pessoas (área restrita, sem repetir o conteúdo) e cobranças com lembrete; por comandos `/` (na hora) e por texto livre (rotina a cada 2h) | 1 | Ponte + Grok |

### Rotina diária

| ID | Requisito | Fase | Onde |
| --- | --- | --- | --- |
| RF-07 | Briefing diário no Discord até as 8h: agenda, alertas, pendências, e-mails que pedem resposta, tarefas sugeridas | 1 | Grok + Ponte |
| RF-08 | Lista de tarefas com prioridade, origem e prazo; marcar como feita pelo Discord | 1 | Ponte |
| RF-09 | Resumo semanal na sexta: o que andou, travou, decisões e riscos da semana seguinte | 1 | Grok |
| RF-10 | Ler Gmail, Calendar e Drive; separar e-mails que pedem ação e achar documentos ligados a reuniões | 1 | Grok (conectores) |
| RF-11 | Bloquear tempo na agenda do Paulo para tarefas, avisando no Discord | 1 | Grok |
| RF-12 | Indicar reuniões delegáveis ou dispensáveis, com motivo | 2 | Grok |

### Reuniões

| ID | Requisito | Fase | Onde |
| --- | --- | --- | --- |
| RF-13 | Nota de preparação 30 min antes: participantes, histórico, pendências, dados do board, pauta sugerida | 2 | Grok + Ponte |
| RF-14 | Durante a call: transcrição enviada à ponte; pautas e respostas sugeridas quando o Paulo pergunta | 3 | Extensão + Ponte + Grok |
| RF-15 | Durante a call: busca na base sob demanda | 3 | Ponte + Grok |
| RF-16 | Após a call: nota com decisões e o porquê, tarefas com dono e prazo, riscos | 4 | Grok + Ponte |
| RF-17 | Após a call: rascunhos de work items e mensagens para aprovação | 4 | Ponte |

### Pessoas, 1:1 e PDI

| ID | Requisito | Fase | Onde |
| --- | --- | --- | --- |
| RF-18 | Importar a pasta local de colaboradores (markdown em pastas), mantendo estrutura e origem, usando as pastas para classificar o tipo de nota | 0 | Importador |
| RF-19 | Perfil por pessoa: papel, objetivos, PDI, histórico de 1:1, entregas e feedbacks registrados pelo Paulo | 2 | Vault + Ponte |
| RF-20 | Planos por papel (começando por Tech Lead e Scrum Master): competências, expectativas por nível, trilha | 2 | Vault |
| RF-21 | Montar e revisar o PDI de cada pessoa a partir do plano do papel | 2 | Grok |
| RF-22 | Pauta de 1:1: andamento do PDI, combinados, sinais do board, temas sugeridos | 2 | Grok + Ponte |
| RF-23 | Registrar o 1:1 com combinados e próximos passos | 4 | Grok + Ponte |
| RF-24 | Lembrar 1:1 e revisões de PDI atrasados | 2 | Grok |

### Comunicação com o CTO

| ID | Requisito | Fase | Onde |
| --- | --- | --- | --- |
| RF-25 | Pauta da reunião quinzenal: evoluções e conquistas primeiro, depois decisões e pontos de atenção | 2 | Grok |
| RF-26 | Pacote de decisão: problema, opções, recomendação, dados | 4 | Grok |
| RF-27 | Registro contínuo de conquistas do Paulo e do time | 1 | Ponte + Vault |
| RF-37 | Pontos de atenção levados cedo: o que vi, desde quando, o que já fiz, o que pode acontecer, o que preciso | 2 | Grok + Ponte |

### Persona de liderança

| ID | Requisito | Fase | Onde |
| --- | --- | --- | --- |
| RF-28 | Guia de estilo versionado, aplicado a todo texto em nome do Paulo | 0 | Grok + Vault |
| RF-29 | Correções do Paulo viram sugestões de regra nova, com OK | 4 | Grok + Ponte |
| RF-30 | Checagem de tom antes de enviar | 4 | Grok |

### Memória

| ID | Requisito | Fase | Onde |
| --- | --- | --- | --- |
| RF-31 | Notas de reuniões, decisões, pessoas, times e produtos, com links e a fonte de cada fato | 0 | Vault + Ponte |
| RF-32 | Busca por significado e palavra-chave, com filtros por time, pessoa e data | 2 | Ponte |
| RF-33 | Só conteúdo revisado entra no índice principal; transcrição bruta fica à parte | 3 | Ponte |
| RF-34 | Registrar o porquê das decisões e comparar com o que o Copiloto sugeriria | 5 | Ponte + Grok |

### Interface e controle

| ID | Requisito | Fase | Onde |
| --- | --- | --- | --- |
| RF-35 | Bot no Discord com canais por assunto e botões aprovar, editar, recusar | 0 | Ponte |
| RF-36 | Conversa livre sobre times, pessoas, métricas e histórico | 1 | Grok |

## Não funcionais

| ID | Tema | Requisito |
| --- | --- | --- |
| RNF-01 | Disponibilidade | No ar nos dias úteis, 7h às 19h; falhas avisadas no Discord |
| RNF-02 | Prazo do briefing | Pronto até as 8h |
| RNF-03 | Latência ao vivo | Consulta na call com tempo medido na fase 3; teleprompter (fase 5) em até 3 s |
| RNF-04 | Segurança | Segredos fora do código; tokens com escopo mínimo, só leitura até a fase 4; Discord privado com verificação em duas etapas; ponte só acessível por túnel autenticado |
| RNF-05 | Privacidade | PDI, 1:1 e notas sobre pessoas na área restrita, enviados ao modelo só quando a tarefa exige, nunca em canais compartilhados |
| RNF-06 | Auditoria | Toda ação e toda chamada de ferramenta registradas: o quê, quando, por qual agente, por quê |
| RNF-07 | Rastreabilidade | Toda afirmação cita a fonte |
| RNF-08 | Portabilidade | Memória em markdown legível; índice reconstruível; cérebro trocável por outro agente com MCP |
| RNF-09 | Custo | Alerta ao atingir 80% de qualquer limite de uso |
| RNF-10 | Qualidade | Avaliações com casos reais anonimizados a cada mudança de prompt ou skill |
| RNF-11 | Observabilidade | OpenTelemetry na ponte, traces por ferramenta e rotina |
| RNF-12 | Idioma e estilo | Português do Brasil, seguindo o guia de persona |

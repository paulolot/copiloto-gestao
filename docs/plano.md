# Plano: Copiloto Gestão

Versão de 21/10/2026. Documento vivo e editável: https://claude.ai/artifact/CqqDCb6gjt4RmrCQFFxUDQ

## Visão

Um conjunto de agentes que faz o ciclo de trabalho de um coordenador de desenvolvimento: acompanha os boards e o código dos três times, prepara e acompanha reuniões, cuida de pessoas (1:1, PDI, planos por papel), leva ao CTO o que importa e registra tudo numa memória própria, sempre no estilo de liderança do Paulo.

O cérebro é o **Grok Bot**: os agentes rodam lá como rotinas e skills, leem o Google pelos conectores nativos e alcançam o resto pela **ponte MCP** construída neste repositório. É um projeto novo, separado do Gestor.

## Decisões de base

| Tema | Decisão |
| --- | --- |
| Nome | Copiloto Gestão |
| Cérebro | Grok Bot, incluído no plano do Cursor: rotinas agendadas, skills e conectores |
| Google | Conectores nativos do Grok Bot para Gmail, Calendar e Drive |
| Ponte | Servidor MCP próprio: Azure DevOps, vault, Discord, fila de aprovações e log |
| Boards e código | Azure DevOps, boards dos três times e repositórios, lidos pela ponte |
| Reuniões | Extensão do Chrome envia a transcrição à ponte; o Grok Bot consulta sob demanda |
| Interface | Discord (servidor privado) para briefing e aprovações; app do Grok Bot para conversar |
| Autonomia inicial | Age sozinho no baixo risco; o que chega a outras pessoas ou muda um board pede OK, imposto pela ponte |
| Memória | Vault novo em markdown (Obsidian + Git, repositório privado separado) e índice vetorial servidos pela ponte |
| Dados | Envio aos provedores autorizado pelo Paulo; minimização de dados de pessoas |

## Arquitetura

```
                 ┌──────────── Grok Bot (nuvem) ────────────┐
                 │ rotinas agendadas · skills · conectores  │
                 └───────┬───────────────────┬──────────────┘
          conectores     │                   │ MCP via túnel seguro
   ┌─────────────────────┘                   ▼
   ▼                               ┌──────────────────────┐
Google Workspace                   │  Ponte MCP (máquina  │
(Gmail, Calendar, Drive)           │  do Paulo)           │
                                   │  autonomia, fila de  │
                                   │  aprovação, log      │
                                   └──┬──────┬──────┬─────┘
                                      ▼      ▼      ▼      ▲
                              Azure DevOps  Vault  Discord  Extensão do Meet
                                                             (transcrição)
```

Transcrição ao vivo: o Grok Bot **consulta** a transcrição quando o Paulo pergunta durante a call (fase 3) e a lê inteira depois (fase 4). Sugestões proativas em até 3 segundos exigem a extensão chamando a API da xAI direto; isso fica para a fase 5, se a consulta não bastar.

## Escopo inicial

Organização `metanetsistema` no Azure DevOps. Começa pelo Squad Fiscal; os outros dois entram depois que o briefing estiver confiável.

| Ordem | Time | Produto | Area path | Repositórios |
| --- | --- | --- | --- | --- |
| 1 | Squad Fiscal | Londrina, desktop legado MetaNet | Squad Fiscal | projeto Metanet: projeto-metaposto-net |
| 2 | Squad Desktop | Pato Branco, desktop legado AutoXpert | Squad Desktop | projeto ATXDados: AtxDados-DB; projeto AutoXPert: AtxExec, AtxRelat, EAtxFiscal, AtxNFSe, Admin |
| 3 | Squad Retaguarda WEB | Pato Branco, web | Squad Retaguarda WEB | projeto Metanet: RetaguardaWeb_angular-client, RetaguardaWeb_servidor-nest, BackendWeb_atxdados |

## Agentes

| Agente | No Grok Bot | Gatilho | Entrega |
| --- | --- | --- | --- |
| Observador de boards | Rotina | A cada hora, dias úteis | Saúde por time e alertas |
| Planejador do dia | Rotina | 7h30 e sexta à tarde | Briefing diário e resumo semanal |
| Preparador de reunião | Rotina | A cada 30 min, olhando as próximas reuniões | Nota de preparação com pauta |
| Copiloto de reunião | Skill | Quando o Paulo pergunta na call | Respostas na conversa |
| Escriba | Rotina + skill | Fim de cada reunião | Nota no vault e rascunhos para aprovar |
| Coach de pessoas | Skill | Antes e depois de cada 1:1 | Pauta e registro de 1:1, PDI |
| Porta-voz | Rotina + skill | Dois dias antes da reunião quinzenal com o CTO | Pauta quinzenal e pacotes de decisão |
| Curador da memória | Rotina | Toda noite | Vault organizado, índice atualizado |

## Política de autonomia

| Ação | Nível inicial | Pode subir quando |
| --- | --- | --- |
| Criar e editar notas no vault | Sozinho | Já no máximo |
| Gerar briefing, alertas, nota de preparação | Sozinho | Já no máximo |
| Bloquear tempo na própria agenda | Sozinho, avisando | Já no máximo |
| Registrar 1:1 e atualizar PDI no vault | Sozinho, área restrita | Compartilhar PDI com a pessoa sempre pede OK |
| Comentar em work item | Pede OK | Aprovação sem edição acima de 90% por 4 semanas |
| Criar ou alterar work item | Pede OK | Mesma regra, por tipo de item |
| Enviar mensagem ou e-mail a outra pessoa | Pede OK | Só para destinatários e tipos liberados pelo Paulo |
| Aceitar, recusar ou marcar reunião com outros | Pede OK | Só com regra explícita |
| Enviar relatório ou pacote de decisão ao CTO | Pede OK | Não sobe |
| Alterar o guia de persona | Pede OK | Não sobe |
| Apagar qualquer coisa fora do vault | Nunca | Não sobe |

Toda ação fica num log com motivo e fonte.

## Métricas iniciais (por time)

| Métrica | Alerta |
| --- | --- |
| Itens envelhecendo | Sem mudança de estado acima do limite do time |
| Itens bloqueados | Bloqueio acima de 2 dias úteis |
| WIP por pessoa e por coluna | Acima do limite combinado |
| Cycle time e lead time | Alta por 2 sprints |
| Throughput | Queda forte contra a média |
| Compromisso da sprint | Abaixo do combinado em 2 sprints seguidas |
| Bugs abertos e escapados | Acima do usual ou sem dono |
| Escopo adicionado na sprint | Acima do limite do time |
| Bug rate | Acima de 10% (nível essencial) ou em alta por 2 sprints |
| MTTR | Média em alta contra a linha de base; sem tempo-alvo |
| Frequência de commit | Repositório ativo parado por dias, ou queda forte |

- Limites começam pela linha de base das últimas 8 semanas de cada time.
- Frequência de commit por time e repositório, nunca por pessoa.
- Métricas por colaborador (decisão de 21/10/2026) existem além das do time, em ferramenta específica: WIP, entregas, cycle e lead time, itens parados e paralisados, bugs. São área restrita: sem ranking, sem comparação entre pessoas, só para 1:1 e PDI.
- Bloqueio = campo **Paralisado** (`Custom.Status`): preenchido com algum texto, o item está paralisado.
- Bug = work item do tipo **Bug**; o campo **Tipo Bug** os separa em "Bug Interno" e "Bug Externo" (produção). **Bug rate e MTTR contam os dois**; bugs escapados e a gravidade de "sem dono" olham o Externo.
- Colunas do board, em ordem (iguais nos três times): Ideias · Backlog · Fazendo Análise · Disponível para Dev · Dev implementando · Disponível Revisão de Código · Realizando revisão de código · Disponível para teste · Testando · Aguardando pipeline · Pronto pra release · Release candidate · Concluído.
  - O Squad Fiscal não tem *Release candidate*; o Retaguarda WEB tem uma coluna extra, **UX**. A ordem é o que vale, então coluna que falta não atrapalha.
  - **Ideias** e **UX** não entram em nenhuma métrica.
  - **Lead time:** da entrada em *Backlog* até *Concluído*.
  - **Cycle time:** da entrada em *Fazendo Análise* até a primeira chegada a *Pronto pra release* (ou *Release candidate*, ou estado Resolved).
  - **WIP** = de *Fazendo Análise* até *Aguardando pipeline*. "Entregue" (throughput, compromisso da sprint) = *Concluído*.
  - Nomes de coluna são comparados sem diferenciar maiúsculas, acentos e espaços extras. Coluna com nome desconhecido aparece em `colunasDesconhecidas` na fonte das respostas de boards.
  - Item parado = dias sem nenhuma alteração (o Azure DevOps não guarda a data de mudança de coluna dentro de um estado).

## Persona de liderança

Meta: autoridade sem autoritarismo. Guia de estilo versionado no vault, lido por todo agente antes de escrever em nome do Paulo; muda só com OK dele.

Princípios iniciais: decide com clareza e diz o porquê; ouve antes quando o time tem o melhor contexto; fala de fatos, critica o trabalho e não a pessoa; assume a responsabilidade para cima e dá crédito nominal ao time; firme em prazos, flexível no como; direto e curto, sem ironia nem ameaça.

| Contexto | Tom |
| --- | --- |
| Time, dia a dia | Próximo e objetivo; pede opinião, fecha com decisão e próximo passo |
| Feedback difícil | Fato, impacto e expectativa; reconhece o que vai bem; combina acompanhamento |
| 1:1 e PDI | Mais perguntas que respostas; compromissos dos dois lados |
| Pares e outras áreas | Colaborativo; problema comum e quem decide o quê |
| CTO | Evoluções primeiro; pontos de atenção cedo, com o que já foi feito e pedido claro |

Evolução: v1 com exemplos reais (fase 0); edições do Paulo viram sugestões de regra; checagem de tom antes de enviar; revisão mensal.

## Reunião quinzenal com o CTO

O CTO quer ver principalmente o que o time fez de bom e evoluiu. Pauta montada pelo Porta-voz dois dias antes:

1. Evoluções e conquistas, com números e crédito nominal ao time.
2. Decisões a tomar: problema, opções, recomendação, o que acontece se nada for decidido.
3. Pontos de atenção, cada um em: **o que vi · desde quando · o que já fiz · o que pode acontecer · o que preciso de você**.

Regras: sinal amarelo vai à pauta antes de virar vermelho (o Copiloto registra a data em que cada sinal surgiu); nenhum problema vai sem ação já tomada; algo grave gera sugestão de aviso curto ao CTO na hora; conquistas abrem a reunião.

## Fases (cerca de 8 a 10 semanas)

| Fase | Duração | Entrega | Gate |
| --- | --- | --- | --- |
| 0 Fundação | 1 semana | Grok Bot configurado, ponte mínima (vault, Discord), túnel, vault novo, importação, persona v1 | Grok Bot lê agenda e vault e posta no Discord pela ponte |
| 1 Boards e rotina | 2 semanas | Azure DevOps na ponte, métricas, briefing diário, resumo semanal | Briefing útil em 4 de 5 dias por 2 semanas |
| 2 Reuniões e pessoas | 2 semanas | Preparação, Coach (Tech Lead e Scrum Master primeiro), pauta do CTO | Úteis na maioria dos casos de 2 semanas |
| 3 Consulta ao vivo | 1 a 2 semanas | Extensão do Meet + skill do Copiloto de reunião | Respostas úteis com tempo aceitável |
| 4 Escriba, ações e CTO | 2 semanas | Notas pós-reunião, rascunhos com aprovação, pacotes de decisão, checagem de tom | Taxa de aprovação sem edição medida |
| 5 Memória e autonomia | Contínuo | Comparação sugestão x decisão, autonomia por tipo de ação, teleprompter se preciso | — |

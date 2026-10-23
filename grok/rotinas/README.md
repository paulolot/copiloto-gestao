# Rotinas e skills do Grok Bot: tudo que deve ser cadastrado

> Roteiro único desta pasta. Cada rotina tem o prompt pronto para colar no arquivo ao lado deste.

Este é o roteiro único para cadastrar no Grok Bot. Cada rotina tem um arquivo nesta pasta com o prompt pronto para colar. Os horários estão no fuso **America/Sao_Paulo**, só em dias úteis (segunda a sexta), salvo onde dito o contrário. Os nomes dos menus do Grok Bot podem mudar; o que importa é: criar uma rotina agendada, colar o prompt, definir o horário, ligar os conectores indicados e o conector MCP **Copiloto Gestão** (ver `../../docs/conectar.md`, passo 6).

## 1. Rotinas que já estão prontas

| # | Rotina | Arquivo | Quando | Conectores além do MCP | Onde escreve |
| --- | --- | --- | --- | --- | --- |
| 1 | **Briefing diário** | `briefing-diario.md` | 7h30 (`30 7 * * 1-5`) | Calendar, Gmail, Drive | `#briefing`, e `#alertas` se algo grave |
| 2 | **Planejamento** (marcos, regras, tarefas, decisões) | `planejamento.md` | 5x ao dia, de 2 em 2 horas: 8h, 10h, 12h, 14h, 16h (`0 8,10,12,14,16 * * 1-5`) | nenhum | `#planejamento` |
| 3 | **Captura** (insights, pessoas, cobranças em texto livre) | `captura.md` | 5x ao dia, mesmos horários da rotina 2 | nenhum | `#insights`, `#pessoas`, `#cobrancas` |
| 4 | **Resumo semanal** | `resumo-semanal.md` | sexta, 16h (`0 16 * * 5`) | Calendar | `#briefing` |
| 5 | **Observador de boards** (opcional) | `observador-boards.md` | de hora em hora, 8h às 16h (`0 8-16 * * 1-5`) | nenhum | `#alertas` |
| 6 | **Teste de fundação** | `teste-fundacao.md` | manual, uma vez (gate da fase 0, já passou); só repita se mudar a conexão | Calendar | `#briefing` |

### Ferramentas da ponte que cada rotina usa

| Rotina | Ferramentas |
| --- | --- |
| Briefing diário | `boards_sincronizar`, `boards_saude`, `boards_itens_problema`, `um_a_um_pendentes`, `tarefa_listar`, `tarefa_criar`, `tarefas_postar`, `vault_ler`, `discord_postar` |
| Planejamento | `discord_ler_novas`, `discord_marcar_lido`, `discord_postar`, `marco_definir`, `boards_marcos`, `boards_tags`, `tarefa_criar`, `tarefa_concluir`, `vault_criar_nota` |
| Captura | `discord_ler_novas`, `discord_marcar_lido`, `discord_postar`, `vault_criar_nota`, `vault_buscar`, `pessoa_registrar`, `tarefa_criar`, `tarefa_listar`, `tarefa_concluir` |
| Resumo semanal | `boards_sincronizar`, `metricas_time`, `boards_alertas`, `boards_itens_problema`, `boards_marcos`, `vault_buscar`, `conquista_registrar`, `tarefa_listar`, `discord_postar` |
| Observador de boards | `boards_alertas`, `boards_itens_problema`, `discord_postar` |

## 2. Skill já pronta

| Skill | Arquivo | Uso |
| --- | --- | --- |
| **Persona** | `../skills/persona.md` | Princípios e tom do Paulo; texto para outra pessoa entra na fila com `mensagem_propor`. Todas as rotinas leem `persona/guia-de-estilo.md` antes de escrever em seu nome. Versão 1 de 22/10/2026; o texto integral fica no vault privado e as pendências estão em `../../docs/checklist-paulo.md`. |

## 3. O que ainda vai existir (textos escritos nas fases indicadas)

| Rotina ou skill | Fase | Quando vai rodar | O que faz |
| --- | --- | --- | --- |
| **Preparador de reunião** | 2 | a cada 30 min, 7h às 16h30 (`*/30 7-16 * * 1-5`), olhando as próximas reuniões | Nota de preparação com pauta, pendências e documentos; posta em `#reunioes` |
| **Reuniões recorrentes** (`reunioes_recorrentes`) | 2 | dias úteis, 8h (`0 8 * * 1-5`): prepara as reuniões que você cadastrou no `#reunioes` (`/reuniao_nova`) e que caem hoje | Pendências, fontes (planilhas e documentos do Drive), boards, marco, e-mails e decisões; posta sempre em `#reunioes`; conectores Calendar, Gmail e Drive; ferramentas `reuniao_recorrente_*`, `boards_*`, `metricas_time`, `vault_*`, `tarefa_*`, `discord_postar`. O texto livre do `#reunioes` é cadastrado pela rotina Planejamento |
| **Coach de pessoas** (skill) | 2 | antes e depois de cada 1:1, sob demanda | Pauta e registro de 1:1, PDI; usa `pessoa_ler` na área restrita |
| **Porta-voz** (pauta do CTO) | 2 | todo dia 9h, agindo só quando a reunião quinzenal for em 2 dias | Pauta: evoluções e conquistas, decisões, pontos de atenção; posta em `#cto` |
| **Curador da memória** | 5 | 7h10, dias úteis (`10 7 * * 1-5`), pois a ponte só fica ligada de 7h às 17h | Organiza o vault, revisa a inbox, atualiza o índice |
| **Copiloto de reunião** (skill) | 3 | sob demanda, durante a call | Responde com a transcrição ao vivo |
| **Escriba** | 4 | a cada 15 min, 8h às 17h, detectando reuniões que acabaram | Nota pós-reunião e rascunhos de ações para aprovar |

## 4. Ordem de cadastro recomendada

1. Skill **Persona** (as outras rotinas dependem dela).
2. **Teste de fundação**, só se a conexão foi refeita.
3. **Briefing diário**. Use por alguns dias antes de seguir.
4. **Planejamento** e **Captura** (comece pelo texto livre; os comandos `/` já funcionam sem elas).
5. **Resumo semanal**.
6. **Observador de boards**, só se os avisos automáticos da ponte em `#alertas` não bastarem.

## 5. Quantas execuções por dia

Rotinas 1 a 5 somam por dia útil: 1 (briefing) + 5 (planejamento) + 5 (captura) + 9 (observador) = **20 execuções**, mais 1 por semana do resumo. Se o seu plano do Grok Bot limitar rotinas ou execuções:

- **Una Planejamento e Captura em uma rotina só** ("Conversas"), colando o prompt de `captura.md` depois do de `planejamento.md` no mesmo cadastro. Cai para 6 execuções por dia.
- **Dispense o Observador de boards**: a ponte já sincroniza de hora em hora e posta sinais novos em `#alertas` sozinha. Cai para 11 execuções por dia.
- Os comandos `/tarefa`, `/insight`, `/pessoa`, `/cobrar`, `/marcos` e `/tarefas` não gastam execução: respondem na hora, direto pela ponte.

## 6. Como conferir que cada rotina está viva

| Rotina | Teste de 1 minuto |
| --- | --- |
| Briefing diário | Rode manualmente; deve chegar em `#briefing` com a seção "Fontes consultadas" |
| Planejamento | Escreva em `#planejamento`: "regras do próximo marco do fiscal: confiança 95"; na próxima execução ela responde o que registrou. Confira com `/marcos` |
| Captura | Escreva em `#insights` uma frase solta; depois da execução, a resposta mostra o caminho em `inbox/` |
| Resumo semanal | Rode manualmente numa quarta; deve trazer o que andou, o que travou, marcos e riscos |
| Observador | Provoque um sinal (item paralisado) e confira `#alertas` |

Log de auditoria: toda chamada de ferramenta fica registrada; para ver as últimas, `SELECT tool, origin, result, ts FROM audit_log ORDER BY id DESC LIMIT 20` no banco da ponte.

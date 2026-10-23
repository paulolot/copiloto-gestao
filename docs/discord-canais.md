# Discord: tópico de cada canal e comandos

> Arquivo gerado por `npm run docs:discord` a partir de `src/ponte/discord/ajuda.ts`. Não edite à mão: mude o código e gere de novo.

## Como preencher

1. No Discord, abra o canal → engrenagem **Editar canal** (Edit Channel) → **Visão geral** (Overview) → campo **Tópico do canal** (Channel Topic).
2. Cole o texto do bloco do canal abaixo. O Discord aceita até **1024 caracteres** no tópico; todos os textos abaixo cabem.
3. Os comandos `/` aparecem sozinhos quando o bot estiver no ar com o escopo `applications.commands` (ver `docs/discord-configuracao.md`).

O tópico aparece no topo do canal. Em celular, toque no nome do canal para ler inteiro.

## Tópicos dos canais

### #briefing (saída: só o Copiloto escreve)

Comandos: /tarefas e /ajuda · 422 de 1024 caracteres

```text
📋 SAÍDA do Copiloto. Seu briefing diário (7h30, dias úteis) e o resumo da semana (sexta, 16h): agenda, alertas dos boards por time, e-mails que pedem ação, tarefas e marcos de entrega. Tudo com a fonte citada.
Só o Copiloto escreve aqui.
Como usar: leia e marque tarefas como feitas nos botões ✔.
Comandos: /tarefas (lista com botões) · /ajuda
Números são por time; cards e WIP trazem o nome de quem é o dono. Sem ranking.
```

### #alertas (saída: só o Copiloto escreve)

Comandos: nenhum específico e /ajuda · 654 de 1024 caracteres

```text
🚨 SAÍDA do Copiloto. Avisos que não esperam o briefing: sinal novo nos boards (item parado ou paralisado, bug sem dono, queda de ritmo, repositório sem commit), marco de entrega em risco e falha de sincronização.
🔴 vermelho = agir hoje · 🟡 amarelo = ficar de olho. Cada aviso diz desde quando o sinal existe.
Cada sinal é avisado uma vez por dia: o que continua sem resolver volta no primeiro ciclo do dia útil seguinte, com a data de quando surgiu, e nunca se repete no mesmo dia. Quando ele deixa de valer, sai um ✅ resolvido; se voltar, é um novo aviso.
Só o Copiloto escreve aqui. Para decidir o que fazer, converse em #planejamento.
Comandos: /ajuda
```

### #aprovacoes (saída: só o Copiloto escreve)

Comandos: nenhum específico e /ajuda · 394 de 1024 caracteres

```text
✅ FILA DE APROVAÇÕES. Tudo que chega a outra pessoa ou muda um board (mensagem, e-mail, work item, comentário) espera aqui o seu OK. Nada é enviado sem você.
Como usar: em cada item, clique em Aprovar (executa), Editar (ajusta o texto e aprova) ou Recusar. Só você consegue clicar; cada decisão fica no log de auditoria.
Itens sem resposta ficam pendentes; nada expira sozinho.
Comandos: /ajuda
```

### #planejamento (entrada: você escreve)

Comandos: /tarefa, /tarefas, /marcos e /ajuda · 545 de 1024 caracteres

```text
🗓️ ENTRADA. Converse aqui com o Copiloto para planejar: marcos de entrega, regras do próximo marco de cada time, tarefas e decisões. Ele responde dizendo o que registrou, para você corrigir.
Texto livre (lido a cada 2h, 8h–16h): "regras do próximo marco do fiscal: confiança 95, janela 8 semanas" · "marco NFC-e: tag entrega-x7, data 15/12".
Instantâneo: /tarefa · /tarefas · /marcos · /ajuda
Regras de marco: confiança (percentil), janela de histórico, tipos, escopo fechado e observações. A tag do marco é a que o time escolheu nos work items.
```

### #insights (entrada: você escreve)

Comandos: /insight e /ajuda · 567 de 1024 caracteres

```text
💡 ENTRADA. Jogue aqui qualquer ideia, observação ou percepção do seu dia sobre time, produto, processo ou negócio. Não precisa organizar: o Copiloto guarda como nota na inbox do vault (para você revisar) e liga com o que já existe.
Como usar: /insight texto:... tema:... (tema é opcional) ou escreva em texto livre (lido a cada 2h).
Exemplos: "o time trava sempre na revisão de segunda" · "cliente X pediu de novo o relatório Y".
Nada é enviado a ninguém. Para impressões sobre pessoas use #pessoas; para cobrar algo de alguém, #cobrancas.
Comandos: /insight · /ajuda
```

### #cobrancas (entrada: você escreve)

Comandos: /tarefas, /cobrar e /ajuda · 518 de 1024 caracteres

```text
🔔 ENTRADA. Algo que alguém ficou de entregar e você precisa lembrar de cobrar. Informe quem, o quê e quando lembrar; o Copiloto avisa no briefing do dia.
Como usar: /cobrar pessoa:Ana assunto:laudo da NFC-e lembrar_em:25/10 (sem data, lembra amanhã) ou texto livre (lido a cada 2h): "cobrar o Pedro do deploy na sexta".
Quando cobrar, marque como feita com o botão ✔ em /tarefas.
O Copiloto nunca cobra a pessoa por você: mensagem a outras pessoas só sai pela fila de #aprovacoes.
Comandos: /cobrar · /tarefas · /ajuda
```

### #pessoas (entrada: você escreve)

Comandos: /pessoa e /ajuda · 563 de 1024 caracteres

```text
🔒 ENTRADA, em sigilo. Escreva aqui o que você quer guardar sobre uma pessoa: uma impressão, uma conversa privada, um feedback dado ou um combinado. Vai para a área restrita do vault (pessoas/), nunca para canais compartilhados.
Como usar: /pessoa nome:Ana tipo:impressao texto:... (tipos: impressao, conversa, feedback, combinado). A resposta só mostra onde foi gravado, nunca o conteúdo.
Você também pode escrever em texto livre; a rotina de captura (a cada 2h) registra e confirma só o caminho.
Serve de base para 1:1, PDI e feedback.
Comandos: /pessoa · /ajuda
```

### #reunioes (entrada: você escreve)

Comandos: /reuniao_nova, /reuniao_lista, /reuniao_ajustar, /reuniao_remover e /ajuda · 810 de 1024 caracteres

```text
📅 ENTRADA e SAÍDA. Aqui você cadastra as reuniões recorrentes e o Copiloto entrega a pauta de cada uma na manhã do dia (pendências da última, boards, marco, planilhas, e-mails, decisões), depois dos resumos e rascunhos de ações para aprovar.
Cadastrar: /reuniao_nova titulo:... dia:... hora:... assunto:... (o título é o do evento no Google Calendar; dá para informar participantes, times, marco, fontes e instrucoes) ou escreva em texto livre (lido a cada 2h): "toda terça 15h, Revisão de arquitetura, com o time fiscal".
Ver e mudar: /reuniao_lista · /reuniao_ajustar · /reuniao_remover
Notas de pessoas e de 1:1 nunca aparecem aqui: ficam na área restrita do vault. Nada é enviado a ninguém sem o seu OK em #aprovacoes.
Comandos: /reuniao_nova · /reuniao_lista · /reuniao_ajustar · /reuniao_remover · /ajuda
```

### #cto (saída: só o Copiloto escreve)

Comandos: nenhum específico e /ajuda · 377 de 1024 caracteres

```text
🧭 SAÍDA do Copiloto (a partir da fase 2). Pauta da reunião quinzenal com o CTO, montada 2 dias antes: 1) evoluções e conquistas com crédito ao time, 2) decisões a tomar, 3) pontos de atenção (o que vi · desde quando · o que já fiz · o que pode acontecer · o que preciso).
Nada vai ao CTO daqui: relatório ou aviso ao CTO só sai depois do seu OK em #aprovacoes.
Comandos: /ajuda
```

## Comandos

Só você (o dono do servidor configurado em `DISCORD_OWNER_ID`) consegue usá-los. Cada comando só funciona nos canais indicados.

### /ajuda

Mostra para que serve um canal e como usá-lo. Funciona em: qualquer canal.

  - `canal` (opcional): Canal (padrão: o canal atual)

Exemplo: `/ajuda canal:insights`

### /tarefa

Cria uma tarefa na sua lista. Funciona em: #planejamento.

  - `titulo` (obrigatória): O que precisa ser feito
  - `prioridade` (opcional): alta, media ou baixa (padrão: media)
  - `prazo` (opcional): hoje, amanha, 25/10, 25/10/2026 ou 2026-10-25

Exemplo: `/tarefa titulo:Revisar proposta do fiscal prioridade:alta prazo:25/10`

### /tarefas

Mostra as tarefas abertas, com botão para marcar como feita. Funciona em: #planejamento, #briefing, #cobrancas.

  - sem opções

Exemplo: `/tarefas`

### /marcos

Resume os marcos de entrega (andamento, chance de cumprir a data). Funciona em: #planejamento.

  - sem opções

Exemplo: `/marcos`

### /cobrar

Cria um lembrete para cobrar algo de alguém. Funciona em: #cobrancas.

  - `pessoa` (obrigatória): Quem deve a entrega
  - `assunto` (obrigatória): O que precisa ser cobrado
  - `lembrar_em` (opcional): Quando lembrar: hoje, amanha, 25/10... (padrão: amanha)

Exemplo: `/cobrar pessoa:Ana assunto:laudo da NFC-e lembrar_em:25/10`

### /insight

Anota uma ideia ou observação do seu dia. Funciona em: #insights.

  - `texto` (obrigatória): A ideia ou observação
  - `tema` (opcional): Título curto (padrão: o começo do texto)

Exemplo: `/insight texto:O time trava sempre na revisão de segunda tema:fila de revisão`

### /reuniao_nova

Cadastra uma reunião recorrente para o Copiloto preparar a pauta. Funciona em: #reunioes.

  - `titulo` (obrigatória): Título do evento no Google Calendar, igual ao da agenda
  - `dia` (obrigatória): Dia da semana
  - `hora` (obrigatória): Hora de início: 11:00, 11h ou 11h30
  - `assunto` (obrigatória): Para que serve a reunião e o que se discute
  - `frequencia` (opcional): semanal (padrão) ou quinzenal
  - `participantes` (opcional): Quem participa
  - `times` (opcional): Times dos boards envolvidos (fiscal, desktop...)
  - `marco` (opcional): Marco de entrega acompanhado, com a data
  - `fontes` (opcional): Links de planilhas e documentos que acompanham a reunião
  - `instrucoes` (opcional): Como você quer a pauta: o que priorizar ou evitar
  - `inicio` (opcional): Data de uma ocorrência (define as semanas da quinzenal)

Exemplo: `/reuniao_nova titulo:[IMEX] Projeto Web dia:sexta hora:11h assunto:Impedimentos e marco Versão clássica marco:Versão clássica 30/11 fontes:https://docs.google.com/spreadsheets/d/...`

### /reuniao_lista

Mostra as reuniões recorrentes cadastradas. Funciona em: #reunioes.

  - sem opções

Exemplo: `/reuniao_lista`

### /reuniao_ajustar

Muda um campo de uma reunião recorrente cadastrada. Funciona em: #reunioes.

  - `id` (obrigatória): Número da reunião (veja em /reuniao_lista)
  - `campo` (obrigatória): O que mudar
  - `valor` (obrigatória): Novo valor (use - para limpar um campo opcional)

Exemplo: `/reuniao_ajustar id:2 campo:hora valor:14h`

### /reuniao_remover

Remove uma reunião recorrente do cadastro. Funciona em: #reunioes.

  - `id` (obrigatória): Número da reunião (veja em /reuniao_lista)

Exemplo: `/reuniao_remover id:3`

### /pessoa

Registra, em sigilo, algo sobre uma pessoa (área restrita). Funciona em: #pessoas.

  - `nome` (obrigatória): A pessoa
  - `tipo` (obrigatória): impressao, conversa, feedback ou combinado
  - `texto` (obrigatória): O que você quer registrar

Exemplo: `/pessoa nome:Ana tipo:impressao texto:Tomou a frente do problema da NFC-e sem ser pedido`

# Backlog — Fase 2: Reuniões e pessoas

**Objetivo:** o Copiloto prepara as reuniões, cuida do ciclo de pessoas (perfil, plano por papel, PDI, 1:1) e monta a pauta quinzenal do CTO, sempre no estilo do Paulo.
**Requisitos:** RF-12, RF-13, RF-19, RF-20, RF-21, RF-22, RF-24, RF-25, RF-32, RF-37.
**Duração prevista:** 2 semanas de desenvolvimento, mais 2 semanas de uso para o gate.

**Gate de saída:** preparação de reunião, pauta de 1:1 e pauta do CTO **úteis na maioria dos casos durante 2 semanas** (o Paulo anota "útil / não útil" e o que faltou ou sobrou).

Legenda: **[código]** pode ser feito numa sessão na nuvem · **[Paulo]** depende do Paulo (ver `checklist-paulo.md`) · **[máquina]** precisa da máquina do Paulo.

## Pré-requisitos (vêm da fase 1 e da fase 0)

- Fase 1 validada: T1.11 feita e o gate do briefing (4 de 5 dias úteis por 2 semanas) cumprido. A fase 2 usa os dados dos boards, os sinais datados, as cobranças, o registro por `/pessoa` e a fila de aprovações.
- **Persona v1** aprovada pelo Paulo (T0.10: skill montada em 22/10/2026; falta ele revisar o texto integral no vault). Sem ela, o Coach e a pauta do CTO escrevem num tom genérico. Dá para construir a ponte, mas não vale ligar as rotinas antes.
- Importação real da pasta de colaboradores feita pelo Paulo (T0.9, execução na máquina dele).
- Transcrição do Meet verificada no Workspace (precisa só na fase 3, mas é bom saber já).

## Regras que valem em toda a fase

- Dados de pessoas ficam na **área restrita** (`pessoas/`). Ferramentas específicas, texto fora do log de auditoria (só o caminho), nada em canal do Discord além de "pronto em <caminho>".
- **Compartilhar PDI com a pessoa sempre pede OK** (fila de aprovações). Nada sobe de nível.
- Tudo que o Copiloto escreve nasce com `revisado: false`. **Só conteúdo revisado entra no índice principal** de busca.
- Toda afirmação cita a fonte (nota do vault, work item, evento da agenda, sinal com data).
- Métricas de time continuam por time; as individuais só nas ferramentas específicas, para 1:1 e PDI, sem ranking.
- Cloud: sem acesso ao Google, ao Discord nem ao Azure DevOps; testes com dados simulados e o modelo de embeddings atrás de uma interface (o real é validado na máquina do Paulo).

## Tarefas

- [~] **T2.0 Decisões do Paulo** [Paulo] — destrava as demais
  - **Respondido em 22/10/2026:** embeddings **local**; 1:1 **mensal** com título "Feedback 1:1 - [Colaborador]"; CTO sem depender da agenda (ver T2.9). PDI revisado a cada **6 meses** (23/10/2026). Planos por papel: v1 montada (23/10/2026). Reunião: **sem critérios de dispensar ou delegar**; o foco é sugerir quem convidar, e as dailies o Paulo acompanha (T2.8 será redesenhada, ver abaixo). Domínio da empresa: `imex.com.br`.
  - **Embeddings (T2.1):** modelo **local** na máquina do Paulo (nenhum texto sai da máquina; mais lento e precisa baixar o modelo uma vez) ou **API** (mais simples e rápido; o texto das notas vai ao provedor, o que o plano permite só com autorização expressa). Recomendação: local, por causa de PDI e 1:1.
  - **Reunião dispensável ou delegável (T2.8):** quais critérios valem (sem pauta, sem decisão nas últimas ocorrências, o Paulo não é o decisor, só informativa, pode ser resumo em texto…).
  - **Identificar reuniões na agenda (T2.6, T2.7, T2.9):** como o Copiloto reconhece um 1:1 (título com "1:1"? só dois participantes?), a reunião com o CTO (título? e-mail do CTO?) e a quinzena em que ela cai.
  - **Cadência de 1:1 por pessoa** (semanal, quinzenal…) e prazo para revisar o PDI.
  - **Conteúdo dos planos por papel (T2.3):** competências, expectativas por nível e trilha de Tech Lead e Scrum Master.
  - Pronto quando: respostas registradas em `checklist-paulo.md` (seção "Respostas já registradas").

- [x] **T2.1 Busca por significado no vault** [código] (RF-32) — depende de T2.0 (embeddings)
  - Índice vetorial no SQLite, **reconstruível** a partir das notas (RNF-08). Interface de embedder (`embed(texto) → vetor`) com uma implementação local ou por API, conforme a decisão; nos testes, um embedder determinístico falso.
  - Só notas com `revisado: true` entram no índice principal. Área restrita **não** entra nele: tem índice separado, consultável só por ferramenta específica.
  - Ferramenta `vault_buscar_semantico(texto, time?, pessoa?, desde?, ate?)` junto com a busca por palavra-chave, com filtros por time, pessoa e data (usando o frontmatter). Respostas citam o caminho da nota e o trecho.
  - Reindexação incremental (nota nova, editada ou removida) e comando de reconstrução total.
  - Entregue: `vault_buscar_semantico`, `pessoa_buscar_semantico` (restrita, índice separado, consulta e nome fora do log), `vault_reindexar` e `npm run indexar`; índice em arquivo próprio (`INDICE_PATH`), reindexação automática antes da busca (no máximo 1 por minuto). Modelo local `Xenova/multilingual-e5-small` via `@huggingface/transformers` (não é dependência obrigatória: `npm install @huggingface/transformers` na máquina do Paulo). A área restrita indexa todas as notas de `pessoas/` (revisadas ou não), porque só é consultável pela ferramenta restrita.
  - Pronto quando: testes com vault de fixture cobrem indexação, busca por sentido, filtros, exclusão de não revisadas e da área restrita, e reconstrução; execução real com o modelo no checklist do Paulo.

- [x] **T2.2 Perfil por pessoa** [código] (RF-19)
  - Modelos em `vault-template/pessoas/`: `perfil.md` (papel, time, objetivos, cadência de 1:1, datas), `pdi.md`, pasta `1x1/` e os registros do `/pessoa`. Validador de frontmatter dos modelos (como o de T0.8).
  - Ferramenta restrita `pessoa_perfil(pessoa)`: junta perfil, PDI, últimos 1:1, registros recentes (impressões, combinados, feedbacks), entregas e sinais do board da pessoa (usa `metricas_colaborador`) e conquistas. Devolve dados e caminhos, nunca opinião.
  - Pronto quando: testes com pessoas de fixture; nada do conteúdo vai para o log, só os caminhos.

- [~] **T2.3 Planos por papel** [código + Paulo] (RF-20) — depende de T2.0
  - **[código] ✅ 22/10/2026** Modelo `papeis/_modelo.md` (competências, expectativas por nível, trilha de crescimento, sinais de que a pessoa está pronta) e validador (`validarPlanoPapel`). Ferramenta `papel_ler(papel)`: acha o plano pelo nome do arquivo ou pelo campo `papel`, e avisa se está incompleto ou `revisado: false`.
  - **[Paulo]** Fornecer o material de **Tech Lead** e **Scrum Master**; o Claude monta a v1 de cada plano (`revisado: false`) para o Paulo revisar. Depois, os demais papéis, um por vez.
  - **v1 montada em 22/10/2026** a partir dos guias de execução e do insight enviados pelo Paulo: `vault-template/papeis/tech-lead.md` e `scrum-master.md` (copiar para `papeis/` do vault real, revisar e marcar `revisado: true`). O material não define níveis nem cargos: os três níveis (Em desenvolvimento, Consolidado, Referência) e a trilha são **proposta** do Claude, marcados no texto, e a carreira formal fica como `[a completar]`.
  - Pronto quando: os dois planos estão no vault real, revisados, e `papel_ler` os devolve.

- [~] **T2.4 PDI** [código] (RF-21) — depende de T2.2 e T2.3
  - Formato do PDI com ações estruturadas (descrição, competência do plano do papel, prazo, status). Ferramentas restritas `pdi_ler`, `pdi_atualizar` (sozinho, área restrita) e `pdi_atrasados` (ações vencidas e revisões de PDI vencidas).
  - Compartilhar o PDI com a pessoa **sempre** vira item da fila de aprovações (`pede_ok`, sem handler de envio por enquanto: o Paulo copia o texto aprovado).
  - Skill do Coach (T2.10) monta o rascunho de PDI a partir do plano do papel; nasce `revisado: false`.
  - Entregue (23/10/2026): `pdi_ler`, `pdi_atualizar` (criar, adicionar, atualizar, revisar), `pdi_atrasados` e `pdi_compartilhar` (sempre `pede_ok`, só se `revisado: true`, sem as "Notas internas"). Ações no formato `- [A1] **descrição** — competência: … — prazo: AAAA-MM-DD — status: aberta`; competência conferida contra o plano do papel; revisão a cada 6 meses (`PDI_REVISAO_MESES`). Toda edição do Copiloto volta o PDI para `revisado: false`. O texto aprovado aparece em `#aprovacoes` (servidor privado do Paulo).
  - Falta: a parte do Coach que monta o rascunho (T2.10, depende da persona).
  - Pronto quando: testes cobrem criação, atualização, atraso e a fila de aprovação ao compartilhar.

- [x] **T2.5 Lembretes de 1:1 e PDI atrasados** [código] (RF-24) — depende de T2.2
  - Ferramenta restrita `um_a_um_pendentes()`: por pessoa, data do último 1:1 (das notas `1x1/`), cadência esperada e dias de atraso; revisões de PDI vencidas. Só nomes e números.
  - O briefing diário ganha o bloco "1:1 e PDI atrasados" (só nome e dias, sem conteúdo). Sinais datados (`1x1:<pessoa>`) para o Porta-voz usar.
  - Entregue (23/10/2026): `um_a_um_pendentes` (cadência do `perfil.md`, padrão mensal; último 1:1 pelas notas `1x1/` sem contar `-pauta`; revisão de PDI por `proxima_revisao` do `pdi.md`). Os sinais `1x1:<pessoa>` e `pdi:<pessoa>` são criados no ciclo de hora em hora sob o time `1x1`, que **nunca é anunciado** em canal. Briefing com o bloco 2b.
  - Pronto quando: testes com relógio simulado cobrem atraso, cadência por pessoa e pessoa sem 1:1 registrado.

- [~] **T2.6 Pauta de 1:1** [código] (RF-22) — depende de T2.4 e T2.5
  - Ferramenta restrita `um_a_um_preparar(pessoa)`: andamento do PDI, combinados abertos do último 1:1, sinais do board da pessoa, registros desde o último 1:1, conquistas e temas sugeridos (a partir de padrões: item parado há muito tempo, WIP alto, bug sem dono).
  - A pauta é escrita pelo Coach no tom do Paulo e salva em `pessoas/<nome>/1x1/AAAA-MM-DD-pauta.md` (restrito, `revisado: false`). O Discord recebe apenas "Pauta de 1:1 pronta em <caminho>" no `#pessoas`.
  - Entregue (23/10/2026): `um_a_um_preparar` (PDI com ações vencidas, combinados do último 1:1, board da pessoa, registros e conquistas desde o último 1:1, temas sugeridos como fatos com fonte) e `um_a_um_salvar_pauta` (grava `AAAA-MM-DD-pauta.md`, restrito, `revisado: false`, exige fontes, nunca sobrescreve; o `#pessoas` recebe só o caminho; se o Discord falhar a pauta fica salva e a resposta avisa). Uma pauta gerada não conta como 1:1 realizado.
  - Falta: o Coach que escreve a pauta no tom do Paulo (T2.10, depende da persona).
  - Pronto quando: testes provam o conteúdo agregado, a gravação restrita e a ausência de texto no Discord e no log.

- [ ] **T2.7 Preparador de reunião** [código] (RF-13) — depende de T2.1
  - Ferramenta `reuniao_contexto(titulo, participantes[], times[])`: histórico em notas e decisões (busca por sentido e por palavra-chave, sem área restrita), tarefas e cobranças ligadas aos participantes, resumo dos boards dos times envolvidos (sinais com data, marcos) e documentos do Drive (esses a rotina do Grok busca pelo conector).
  - Controle para preparar **uma vez por evento**: `reuniao_preparada(eventoId)` e `reuniao_marcar_preparada(eventoId)`.
  - Rotina `grok/rotinas/preparador-reuniao.md` (a cada 30 min, 7h às 19h): lê a agenda, prepara as reuniões da próxima hora, grava a nota em `reunioes/` (`tipo: preparacao`, `revisado: false`) e posta no `#reunioes` com pauta sugerida e pendências. 1:1 vai pelo fluxo do T2.6, nunca por aqui.
  - Pronto quando: testes do contexto e do controle de duplicidade; texto da rotina pronto para colar.

- [ ] **T2.8 Reuniões: quem convidar** [código] (RF-12) — **redesenhada em 23/10/2026**: o Paulo não quer critérios para dispensar ou delegar (acompanha as dailies; quando não for, lê a transcrição, fase 3). **Sentido confirmado (23/10/2026, opção A):** ao preparar uma reunião, o Copiloto sugere **quem convidar** (assunto, decisões e tarefas anteriores, times envolvidos), com a fonte; nunca sugere dispensar nem delegar, e as dailies não entram. O texto abaixo é o desenho antigo e será reescrito antes de a T2.8 começar — depende de T2.0 e T2.7
  - Ferramenta `reuniao_historico(titulo)`: ocorrências anteriores com nota, quantas geraram decisão ou tarefa, última vez que o Paulo falou ou decidiu.
  - A rotina do briefing aplica os critérios definidos em T2.0 e lista, com o **motivo**, as reuniões do dia que podem ser delegadas ou dispensadas. Só sugere; nunca recusa nem aceita convite (isso pede OK).
  - Pronto quando: testes do histórico; critérios escritos no prompt do briefing.

- [ ] **T2.9 Pontos de atenção e pauta do CTO** [código] (RF-25, RF-37) — depende de T2.2, T2.5 e T1 (sinais e marcos)
  - **Registro de pontos de atenção** (`cto/pontos-de-atencao/`): o que vi, desde quando, o que já fiz, o que pode acontecer, o que preciso do CTO. Ferramentas `ponto_atencao_registrar`, `ponto_atencao_atualizar`, `ponto_atencao_listar`. Ligado a um sinal datado quando houver (o "desde quando" vem do sinal). **Nenhum ponto vai à pauta sem "o que já fiz"**: a ferramenta avisa quando falta.
  - **Sugestão automática:** sinal amarelo com mais de N dias úteis, marco em risco e `1x1:<pessoa>` atrasado viram *candidatos* a ponto de atenção (o Paulo decide).
  - Ferramenta `cto_pauta_dados(desde)`: conquistas revisadas desde a última reunião (com crédito ao time), decisões pendentes (problema, opções, recomendação, o que acontece se nada for decidido), pontos de atenção abertos, marcos e percentis por time.
  - Rotina `grok/rotinas/porta-voz-cto.md` (todo dia 9h; **por cadência, não por evento**: a reunião costuma ser desmarcada e sem eventos novos, então a pauta é remontada a cada 15 dias, e antes disso se houver evento com "Saulo/Paulo" no título nos próximos 2 dias ou se o Paulo pedir): monta a pauta no modelo `cto/_modelo-pauta.md` (**conquistas primeiro**), grava em `cto/AAAA-MM-DD-pauta.md` (`revisado: false`) e posta no `#cto` para o Paulo. Algo grave gera **sugestão** de aviso curto ao CTO na hora. Relatório ou aviso ao CTO só sai pela fila de aprovações e não sobe de nível.
  - Pronto quando: testes cobrem o registro, a regra "sem ação já tomada", a agregação e a ausência de envio sem aprovação.

- [ ] **T2.10 Skills e rotinas do Grok Bot** [código] — depende de T2.4 a T2.9 e da persona v1
  - Skill `grok/skills/coach.md` (Tech Lead e Scrum Master primeiro): como conduzir a preparação do 1:1, montar e revisar o PDI a partir do plano do papel, sugerir temas, respeitar o sigilo, citar fontes.
  - Rotinas: `preparador-reuniao.md`, `porta-voz-cto.md`; ajustes em `briefing-diario.md` (1:1 e PDI atrasados, reuniões dispensáveis) e `resumo-semanal.md` (pontos de atenção abertos e conquistas para a pauta). Atualizar `grok/rotinas/README.md` (horários, conectores, ferramentas).
  - Pronto quando: textos prontos para colar e o README das rotinas atualizado.

- [ ] **T2.11 Discord: ativar `#reunioes` e `#cto`, comandos e ajuda** [código] — depende de T2.7 e T2.9
  - Comando `/atencao titulo texto` (registra um ponto de atenção na hora) e `/revisar caminho` (marca uma nota como revisada, entrando no índice). Atualizar `ajuda.ts`, os tópicos dos canais e `docs/discord-canais.md` (gerado), e os textos de `#reunioes`, `#cto` e `#pessoas` (a pauta de 1:1 só avisa o caminho).
  - Pronto quando: testes dos comandos e do documento gerado.

- [ ] **T2.12 Importação real e carga do vault** [Paulo + máquina] — depende de T2.2 e T2.3
  - Rodar o importador na pasta de colaboradores (`--simular` primeiro), conferir a classificação por pasta, criar `perfil.md` e `pdi.md` para quem já tem material e cadastrar a cadência de 1:1 de cada pessoa.
  - Pronto quando: o Paulo abre o vault no Obsidian sem erros e `pessoa_perfil` devolve um perfil completo de pelo menos duas pessoas (Tech Lead e Scrum Master).

- [ ] **T2.13 Validação com uso real** [Paulo + máquina] — depende de todas
  - Embeddings reais funcionando na máquina; rotinas cadastradas; uma preparação de reunião por dia útil, uma pauta de 1:1 por 1:1 e uma pauta do CTO no ciclo.
  - Registrar, a cada uso, "útil / não útil" e o que faltou ou sobrou (em `#planejamento` ou no checklist). Gate: úteis na maioria dos casos em 2 semanas.

## Ordem sugerida

T2.0 → T2.2 → T2.1 (em paralelo com T2.3) → T2.4 → T2.5 → T2.6 → T2.7 → T2.8 → T2.9 → T2.10 → T2.11 → T2.12 → T2.13.

## Riscos conhecidos

- **Persona com pendências:** a v1 existe, mas o Paulo ainda precisa revisá-la e completar os `[a completar]`; o tom da pauta de 1:1 e da pauta do CTO depende disso.
- **Reconhecer reuniões pela agenda** depende de convenção (título, participantes). Se for inconsistente, o Preparador erra; por isso T2.0.
- **Embeddings locais** podem ser lentos na primeira indexação do vault inteiro; a indexação é incremental e pode rodar à noite.
- **Sigilo:** a pauta de 1:1 junta dados sensíveis. Por isso fica só em `pessoas/` e o Discord recebe apenas o caminho.

# Skill: Coach de pessoas (1:1 e PDI)

Use esta skill para **preparar** um 1:1, **registrar** o que aconteceu, **montar e revisar** o PDI e **propor** o compartilhamento do PDI com a pessoa. Tech Lead e Scrum Master primeiro; vale para qualquer pessoa com 1:1 e PDI.

Antes de escrever qualquer texto, aplique a skill **Persona** (`persona.md`) e leia `persona/guia-de-estilo.md` com `vault_ler`. O tom de 1:1 e PDI é: interessado, comprometido com a evolução, **mais perguntas que respostas**, compromissos dos dois lados, sem tomar a conversa para si nem impor plano.

## Regras que não mudam

1. **Sigilo.** `pessoas/`, PDI e 1:1 são área restrita. Só as ferramentas específicas tocam nela (`pessoa_perfil`, `pdi_*`, `um_a_um_*`, `pessoa_*`). O conteúdo pode aparecer no app para o Paulo, **nunca** em canal do Discord. No Discord vai no máximo o caminho: "Pauta de 1:1 pronta em <caminho>", e quem posta isso é `um_a_um_salvar_pauta`.
2. **Fonte em tudo.** Cada item da pauta ou do PDI cita de onde veio, entre parênteses: caminho da nota, #id do work item, sinal com data. Sem fonte, não escreva.
3. **Fato observável, nunca traço ou intenção.** Escreva "o item #123 está há 12 dias em Fazendo Análise", não "ele é lento" nem "falta de comprometimento". Hipótese nunca vira causa confirmada.
4. **Sem ranking e sem comparação.** Nunca compare pessoas nem ordene por desempenho. Métricas individuais servem só para a conversa daquela pessoa.
5. **O "Perfil e análise" importado é interno.** Estilo de liderança recomendado, pontos de melhoria e leituras antigas orientam você, mas não entram como diagnóstico na pauta nem no PDI. Registro antigo pode estar vencido: não o trate como verdade atual.
6. **Nada vai para a pessoa sem o OK do Paulo.** Tudo o que você escreve nasce `revisado: false`; quem marca `revisado: true` é o Paulo. Compartilhar o PDI só com `pdi_compartilhar` (fila de aprovações).
7. **Não invente.** Prazo, competência, combinado e data que você não tem: pergunte ao Paulo ou escreva `[a completar]`.
8. **Quem o Paulo só acompanha por interação** (`cadencia_1x1: nenhuma`, como João e Otávio) não tem pauta nem PDI. Avise e pare.

## Fluxo A: pauta do 1:1

1. Chame `um_a_um_preparar(pessoa)`. Leia `avisos` primeiro: se faltar board, perfil ou PDI, diga e siga sem aquilo, sem inventar. Se `ultimo_1x1.sem_conteudo` for verdadeiro, não há combinados a retomar.
2. Se o papel tem plano (Tech Lead, Scrum Master), chame `papel_ler(papel)` e use as **perguntas para os 1:1** e os **sinais** do plano para escolher o que perguntar.
3. Monte a pauta curta, em uma página, nesta ordem (omita o que não tiver dado):
   - **Abertura:** como a pessoa está vendo o momento (pergunta aberta).
   - **Combinados do último 1:1:** liste os de `ultimo_1x1.combinados` e pergunte o que avançou. Não presuma que foi feito.
   - **PDI:** ações em aberto, as vencidas e as sem prazo; pergunte que apoio ajuda.
   - **Trabalho recente:** fatos do board como pergunta ("o #123 está há 12 dias no mesmo estado, o que está travando?"). Use `temas_sugeridos` e `board`.
   - **Reconhecimento:** conquistas do time e registros positivos, com crédito específico e evidência.
   - **Temas do Paulo:** registros novos desde o último 1:1 (`registros_desde_o_ultimo_1x1`) e o que o Paulo pediu.
   - **Fechamento:** compromissos dos dois lados e data do próximo 1:1.
4. Grave com `um_a_um_salvar_pauta(pessoa, texto, fontes)`. As `fontes` são obrigatórias (caminhos, #ids, sinais usados). No app, diga ao Paulo o caminho e 3 destaques; no Discord, nada além do aviso automático.

## Fluxo B: depois do 1:1

1. Peça ao Paulo o que foi conversado, o que ficou combinado (com responsável e prazo) e os próximos passos.
2. Registre com `um_a_um_registrar(pessoa, temas, combinados, proximos_passos, data)`. Use as palavras do Paulo, sem interpretar. Isso atualiza o lembrete de 1:1 e abastece a próxima pauta.
3. Impressão, feedback ou combinado avulso, fora de um 1:1: `pessoa_registrar`.
4. Se o Paulo ditou algo que muda o PDI, proponha a mudança e só aplique com `pdi_atualizar` depois que ele confirmar.

## Fluxo C: PDI

1. Reúna o contexto: `pessoa_perfil`, `pdi_ler` e, se houver plano do papel, `papel_ler`.
2. **Criar:** `pdi_atualizar` com `acao: criar`. O objetivo vem das palavras da pessoa no 1:1 e no perfil; se não houver, deixe `[a definir com a pessoa]`.
3. **Ações:** `acao: adicionar`, uma por vez. Cada ação é pequena e verificável: o que, para quê e que sinal mostra que avançou. A `competencia` é o **nome exato** de uma competência do plano do papel (`papel_ler`); se o papel não tem plano, deixe sem competência. O prazo é uma data real combinada; sem data, pergunte ao Paulo.
4. **Acompanhar:** `acao: atualizar` com o id da ação (A1, A2…) para mudar status, prazo ou texto. Use `pdi_atrasados` para ver ações e revisões vencidas.
5. **Revisão semestral:** só registre `acao: revisar` depois que o Paulo disser que a revisão foi feita com a pessoa.
6. **Compartilhar:** só com `pdi_compartilhar`, e só se o PDI estiver `revisado: true`. Vai para `#aprovacoes` com o objetivo e as ações, sem as notas internas. Acompanhe com `aprovacao_consultar`. Recusado: não insista. Aprovado: o Paulo copia o texto e envia; a ponte não envia nada.
7. Depois de qualquer edição o PDI volta a `revisado: false`: avise o Paulo para conferir antes de compartilhar.

## Antes de entregar

- Tem fonte em cada item? Tem fato em vez de rótulo? Tem mais pergunta que afirmação?
- Há algo sobre outra pessoa, comparação ou ranking? Tire.
- O texto soa como o Paulo (curto, "a gente", sem clichê, sem emoji)? Se ficou formulário, simplifique.
- Em conflito sensível, feedback disciplinar ou assunto de saúde e vida pessoal, não entregue versão definitiva sem validar com o Paulo.

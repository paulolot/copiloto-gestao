# Prompt para construir o persona.md no ChatGPT

Como usar:

1. Abra uma conversa nova no ChatGPT (modelo mais capaz, com memória ligada se quiser que ele use o que já sabe sobre você).
2. Anexe o material do curso de reputação e marketing pessoal (PDFs, slides, transcrições). Se for grande, mande em partes, dizendo "material parte 1 de N".
3. Cole o prompt abaixo (tudo dentro do bloco).
4. Responda às perguntas. Ao final, copie o `persona.md` e entregue ao Claude Code, que o encaixa em `vault-template/persona/guia-de-estilo.md` e em `grok/skills/persona.md`.

---

````text
# PAPEL

Você será meu mentor de liderança e reputação e, ao mesmo tempo, o entrevistador de um processo guiado. O objetivo é construir o arquivo **persona.md**: a persona de liderança que eu preciso me tornar (não só a que eu sou hoje), baseada no material do curso de reputação e marketing pessoal que anexei e no que você descobrir sobre mim.

# POR QUE ISSO EXISTE

Sou Paulo, coordenador de desenvolvimento na Meta Sistemas. Estou construindo o "Copiloto Gestão": agentes de IA que executam parte do meu ciclo de trabalho (briefings, mensagens ao time, pauta de reunião quinzenal com o CTO, preparação de 1:1 e PDI, comunicados, respostas em calls). Todo agente lê o persona.md antes de escrever ou sugerir qualquer coisa em meu nome. Por isso o arquivo precisa ser:

- **Operacional**: regras e exemplos que uma IA consiga aplicar sem adivinhar (o que fazer, o que evitar, como soa, como não soa).
- **Fiel ao curso**: usar os conceitos, a linguagem e a lógica do material, não generalidades de internet.
- **Aspiracional e honesto**: descrever o líder que preciso me tornar, mas marcando claramente o que já sou, o que ainda não sou e o que vou treinar. Não pode ser lisonja.

# O QUE JÁ EXISTE (rascunho v1, para você criticar e melhorar, não para obedecer)

Meta: "autoridade sem autoritarismo". Princípios iniciais: decido com clareza e digo o porquê; ouço antes quando o time tem o melhor contexto; falo de fatos e critico o trabalho, não a pessoa; assumo a responsabilidade para cima e dou crédito nominal ao time; firme em prazos, flexível no como; direto e curto, sem ironia nem ameaça.

Tom por contexto (rascunho): time no dia a dia (próximo e objetivo, pede opinião, fecha com decisão e próximo passo); feedback difícil (fato, impacto, expectativa, reconhece o que vai bem, combina acompanhamento); 1:1 e PDI (mais perguntas que respostas, compromissos dos dois lados); pares e outras áreas (colaborativo, problema comum, quem decide o quê); CTO (evoluções primeiro, pontos de atenção cedo, com o que já foi feito e pedido claro).

Estrutura de comunicado importante: contexto (1–2 linhas) → o que foi feito/decidido → o que preciso/próximo passo.

Isso é só hipótese. Questione, aprofunde, troque o que o curso e as minhas respostas indicarem. Você tem liberdade para propor seções, princípios e estrutura novos.

# COMO VOCÊ DEVE CONDUZIR (processo em fases; não pule fases)

**Regras gerais da entrevista**
- Faça de 3 a 5 perguntas por vez, nunca mais. Espere minhas respostas.
- Depois de cada bloco, devolva um resumo curto do que entendeu ("Entendi que...") e peça minha validação: confirmar, corrigir ou aprofundar. Só avance quando eu validar.
- Quando eu responder de forma vaga, peça um exemplo real (uma situação, uma mensagem, uma reunião).
- Não invente fatos sobre mim. Se usar algo que já sabe de conversas anteriores ou da memória, diga "pelo que sei de você, X; está certo e atual?" e deixe eu confirmar.
- Se perceber contradição entre o que eu digo querer ser e o que eu relato fazer, aponte com respeito e peça minha leitura. Esse é o valor central do processo.
- Mostre o andamento no início de cada fase ("Fase 2 de 0 a 6 — etapa 3 de 7").
- Escreva em português do Brasil, tom direto e caloroso, sem enrolação.

**Fase 0 — Leitura do material e alinhamento**
1. Leia todo o material do curso. Se algo estiver ilegível ou incompleto, avise.
2. Devolva: (a) a tese central do curso em até 10 linhas; (b) os conceitos, modelos e frameworks do material, cada um com 1–2 linhas e como você pretende usá-lo na minha persona; (c) o que no material é mais aplicável a um coordenador de tecnologia e o que é menos; (d) as lacunas ou ambiguidades que precisam da minha ajuda.
3. Pergunte se entendeu bem a proposta do curso e peça correções. Só siga depois de eu aprovar sua leitura. Essa fase é obrigatória: quero ter certeza de que você entendeu o material como ele é.

**Fase 1 — Quem eu sou hoje (diagnóstico)**
Entreviste-me sobre: meu papel e contexto (time, produtos, relação com o CTO, pares, outras áreas); como as pessoas me descrevem hoje; como eu me comporto sob pressão, em conflito, ao dar má notícia, ao cobrar prazo, ao dar feedback; o que me deu mais reputação e o que me custou reputação; meus pontos fortes e meus vícios de comunicação. Peça exemplos reais. Aplique ao meu caso os modelos do curso (por exemplo, como minha reputação está hoje segundo cada conceito do material).

**Fase 2 — Quem eu preciso me tornar (alvo)**
Explore: que reputação eu quero ter e com quem (time, CTO, pares, mercado); o que o próximo nível de liderança exige de mim; que percepção hoje atrapalha esse caminho; o que eu quero que digam de mim quando eu não estiver na sala. Use os conceitos do curso para estruturar a pergunta (posicionamento, percepção, consistência, visibilidade ou o que o material tratar). Quando eu descrever o alvo, proponha 2–3 formulações de posicionamento e deixe-me escolher e ajustar.

**Fase 3 — A distância entre os dois (gap)**
Monte uma tabela: dimensão · como sou hoje · como preciso ser · evidência (exemplo que dei) · comportamento concreto que fecha a distância. Valide comigo linha a linha, priorizando as 3–5 mudanças de maior impacto.

**Fase 4 — Voz e comunicação (calibragem para os agentes de IA)**
Peça: 5 a 10 mensagens reais minhas (algumas que representam o estilo que quero e algumas que não), para você analisar; como eu quero soar em cada contexto (time no dia a dia, feedback difícil, 1:1/PDI, pares e outras áreas, CTO, Discord/canais curtos, e-mail formal, decisões técnicas, más notícias, reconhecimento público); palavras e expressões que uso e que quero usar; as que quero banir; limites (sem ironia, sem ameaça, sem expor pessoas em canais compartilhados). Se eu ainda não tiver as mensagens à mão, deixe essa seção marcada como "a completar" em vez de inventar exemplos.

**Fase 5 — Situações-teste**
Dê 4 a 6 cenários realistas do meu dia (ex.: card parado há semanas por culpa de outra área; membro do time entregando abaixo do esperado; erro grave em produção; o CTO questionando um prazo; conquista do time que ninguém notou; discordância pública de um par). Peça minha resposta em até 3 linhas, escreva a sua versão segundo a persona em construção e discutamos as diferenças. Use isso para refinar as regras.

**Fase 6 — Síntese e entrega**
Antes de gerar o arquivo, apresente um resumo da persona em 15 linhas e peça aprovação final. Depois entregue o **persona.md** completo, em um único bloco de código markdown, pronto para copiar.

# FORMATO DO ARQUIVO FINAL

Frontmatter YAML exatamente assim, com a data de hoje:

```
---
tipo: persona
titulo: "Persona de Liderança — Paulo"
data: AAAA-MM-DD
revisado: false
origem: chatgpt+curso
---
```

Seções (adicione outras se o processo mostrar que valem a pena, e diga por quê):

1. **Resumo em uma frase e em um parágrafo**: quem é o líder que estou me tornando.
2. **Posicionamento e reputação desejada**: como quero ser percebido, por quem, e o que quero que digam de mim.
3. **Conceitos do curso aplicados**: cada modelo/conceito do material, traduzido em regra prática para mim.
4. **Quem sou hoje × quem preciso ser**: a tabela de gap e as 3–5 mudanças prioritárias.
5. **Valores e princípios de liderança**: em ordem de prioridade, cada um com "o que significa na prática" e "como se quebra".
6. **Tom por contexto**: tabela (contexto · tom · fazer · evitar) para time, feedback difícil, 1:1/PDI, pares e outras áreas, CTO, Discord/canais curtos, e-mail formal, decisão técnica, má notícia, reconhecimento.
7. **Estruturas prontas**: comunicado importante, feedback difícil, má notícia ao CTO, pedido a par, reconhecimento público, pauta de 1:1.
8. **Voz**: expressões a preferir, expressões a banir, ritmo, tamanho de texto, uso de emoji e formatação por canal.
9. **Exemplos**: "estilo certo" e "estilo a evitar" com mensagens reais ou reescritas validadas por mim (marcadas como real ou sugerida).
10. **Situações-teste resolvidas**: os cenários da Fase 5 com a resposta aprovada.
11. **Anti-padrões**: o que sabota minha reputação, com sinais de alerta para o Copiloto detectar em textos meus.
12. **Regras de reescrita para IA**: nunca mudar fatos; citar qual regra motivou cada mudança; oferecer duas versões quando o original estiver distante; texto para outra pessoa só com meu OK; checagem de tom antes de enviar.
13. **Hábitos de reputação e visibilidade**: práticas recorrentes (semanais, mensais) que o curso sugere e eu aceitei, que o Copiloto pode me lembrar ou preparar (registro de conquistas, pauta com o CTO, devolutivas, comunicação de resultados).
14. **Plano de evolução**: o que treinar nos próximos 30/60/90 dias, como medir progresso e quando revisar este arquivo.
15. **Pendências e lacunas**: o que ficou a completar (ex.: exemplos reais) e perguntas em aberto.
16. **Versão curta**: no máximo 400 palavras com o essencial, para ser colada como instrução fixa de um agente de IA.

Regras do arquivo: português do Brasil; frases curtas; regras no imperativo ("Faça", "Evite"); nada de adjetivos vazios; cada princípio com comportamento observável; marque com `[a completar]` tudo que eu não validei; não invente fatos, citações do curso ou mensagens minhas.

# COMEÇAR AGORA

Comece pela Fase 0: confirme que recebeu o material, faça a leitura e me devolva a tese do curso, os conceitos e como pretende usá-los. Termine perguntando se sua leitura está certa. Não faça perguntas sobre mim antes de eu aprovar essa leitura.
````

---

Depois da entrega: peça ao Claude Code para integrar o arquivo. O persona v1 é a pendência da fase 0 que bloqueia o Coach e a pauta do CTO (ver `docs/checklist-paulo.md`).

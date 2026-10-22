/**
 * Markdown of docs/discord-canais.md: what to paste in the topic of each channel and the slash commands.
 */
import { CANAIS_ENTRADA, COMANDOS, LIMITE_TOPICO, NOMES_CANAIS, TOPICOS, type CanalId } from './ajuda.js';

const ORDEM: CanalId[] = ['briefing', 'alertas', 'aprovacoes', 'planejamento', 'insights', 'cobrancas', 'pessoas', 'reunioes', 'cto'];

export function docsDiscord(): string {
  const canais = ORDEM.map((c) => {
    const t = TOPICOS[c];
    const cmds = COMANDOS.filter((x) => x.canais !== 'todos' && x.canais.includes(c)).map((x) => `/${x.nome}`);
    return `### ${NOMES_CANAIS[c]} (${CANAIS_ENTRADA.includes(c) ? 'entrada: você escreve' : 'saída: só o Copiloto escreve'})

Comandos: ${cmds.length ? cmds.join(', ') : 'nenhum específico'} e /ajuda · ${[...t].length} de ${LIMITE_TOPICO} caracteres

\`\`\`text
${t}
\`\`\`
`;
  }).join('\n');

  const comandos = COMANDOS.map((c) => {
    const onde = c.canais === 'todos' ? 'qualquer canal' : c.canais.map((x) => NOMES_CANAIS[x]).join(', ');
    const ops = c.opcoes.length
      ? c.opcoes.map((o) => `  - \`${o.nome}\` (${o.obrigatoria ? 'obrigatória' : 'opcional'}): ${o.descricao}`).join('\n')
      : '  - sem opções';
    return `### /${c.nome}\n\n${c.descricao}. Funciona em: ${onde}.\n\n${ops}\n\nExemplo: \`${c.exemplo}\`\n`;
  }).join('\n');

  return `# Discord: tópico de cada canal e comandos

> Arquivo gerado por \`npm run docs:discord\` a partir de \`src/ponte/discord/ajuda.ts\`. Não edite à mão: mude o código e gere de novo.

## Como preencher

1. No Discord, abra o canal → engrenagem **Editar canal** (Edit Channel) → **Visão geral** (Overview) → campo **Tópico do canal** (Channel Topic).
2. Cole o texto do bloco do canal abaixo. O Discord aceita até **${LIMITE_TOPICO} caracteres** no tópico; todos os textos abaixo cabem.
3. Os comandos \`/\` aparecem sozinhos quando o bot estiver no ar com o escopo \`applications.commands\` (ver \`docs/discord-configuracao.md\`).

O tópico aparece no topo do canal. Em celular, toque no nome do canal para ler inteiro.

## Tópicos dos canais

${canais}
## Comandos

Só você (o dono do servidor configurado em \`DISCORD_OWNER_ID\`) consegue usá-los. Cada comando só funciona nos canais indicados.

${comandos}`;
}

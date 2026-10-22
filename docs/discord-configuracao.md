# Configuração do bot do Discord: permissões, intents e convite

Tudo que você precisa marcar no **Discord Developer Portal** (discord.com/developers/applications → sua aplicação) e no servidor. Os nomes estão em inglês (como no portal) e em português (como aparecem no Discord em PT-BR). A tradução pode variar um pouco entre versões do Discord.

O bot só faz quatro coisas: **postar** nos canais, **ler** as suas mensagens nos canais de entrada, **mostrar botões** (aprovar, editar, recusar, tarefa feita) e **responder comandos `/`**. Por isso o pedido de permissões é curto. **Não dê Administrador.**

## 1. Aba Bot → Privileged Gateway Intents

| Intent | Em português | Valor | Por quê |
| --- | --- | --- | --- |
| **Message Content Intent** | Intent de Conteúdo de Mensagem | **LIGADO** | Sem ele o Discord entrega o texto das suas mensagens vazio, e o Copiloto não lê `#planejamento`, `#insights`, `#pessoas` e `#cobrancas`. (Alternativa: mencionar o bot com @ em cada mensagem.) |
| Presence Intent | Intent de Presença | desligado | Não usa |
| Server Members Intent | Intent de Membros do Servidor | desligado | Não usa |

O bot se conecta ao gateway só com o intent padrão **Guilds**, que não precisa de aprovação.

## 2. Aba Bot → demais opções

| Opção | Em português | Valor |
| --- | --- | --- |
| **Public Bot** | Bot público | **desligado** (só você pode convidar) |
| **Requires OAuth2 Code Grant** | Requer concessão de código OAuth2 | desligado |
| **Reset Token** | Redefinir token | Copie o token uma vez para `DISCORD_BOT_TOKEN` no `.env`. Se vazar, redefina e atualize o `.env` |

## 3. OAuth2 → URL Generator (para convidar o bot)

**Scopes** (escopos): marque os dois.

| Scope | Para que serve |
| --- | --- |
| `bot` | Entrar no servidor como bot |
| `applications.commands` | Registrar os comandos `/` (`/tarefa`, `/insight`, `/pessoa`...). Sem ele o bot funciona, mas os comandos não aparecem |

**Bot Permissions** (permissões do bot): marque só estas três.

| Permission | Em português | Para que serve |
| --- | --- | --- |
| **View Channels** | Ver canais | Enxergar os canais para postar e ler |
| **Send Messages** | Enviar mensagens | Postar briefing, alertas, a fila de aprovações, as respostas do `#planejamento` e as listas de tarefas com botões |
| **Read Message History** | Ver histórico de mensagens (também aparece como "Ler o histórico de mensagens") | Ler as suas mensagens novas nos canais de entrada, mesmo depois de horas |

O número de permissões dessas três é **68608**. A URL de convite fica:

```text
https://discord.com/oauth2/authorize?client_id=SEU_CLIENT_ID&scope=bot%20applications.commands&permissions=68608
```

Troque `SEU_CLIENT_ID` pelo **Application ID** (aba General Information). Se o bot já estava no servidor sem o escopo `applications.commands`, abra a URL de novo e autorize outra vez: não precisa remover o bot.

### Permissões que NÃO devem ser dadas

| Permission | Em português | Por quê não |
| --- | --- | --- |
| Administrator | Administrador | Dá acesso a tudo |
| Manage Messages / Manage Channels / Manage Server | Gerenciar mensagens / canais / servidor | O bot nunca apaga nem edita nada seu |
| Mention @everyone, @here and All Roles | Mencionar @everyone, @here e todos os cargos | O texto escrito pelo modelo nunca pode chamar ninguém; o código já bloqueia menções |
| Embed Links, Attach Files, Add Reactions | Incorporar links, Anexar arquivos, Adicionar reações | O bot só envia texto e botões |
| Manage Webhooks, Create Invite, Kick/Ban Members | Gerenciar webhooks, Criar convite, Expulsar/Banir | Sem uso |
| Send Messages in Threads, Create Public/Private Threads | Enviar mensagens em tópicos, Criar tópicos | Sem uso |
| Use Application Commands | Usar comandos de aplicativos | É permissão de **quem digita** o comando (você), não do bot |

## 4. No servidor (permissões por canal)

O servidor deve ser **privado, só seu**, com **verificação em duas etapas** na sua conta. O cargo do bot (criado no convite) precisa de **Ver canais** e **Enviar mensagens** em todos os 9 canais. **Ver histórico de mensagens** só é necessário nos 4 canais de entrada. Para ficar o mais restrito possível, desmarque essa permissão no cargo e ligue-a só nesses canais (Editar canal → Permissões → cargo do bot):

| Canal | Tipo | Ver canais | Enviar mensagens | Ver histórico |
| --- | --- | --- | --- | --- |
| `#briefing` | saída | sim | sim | não precisa |
| `#alertas` | saída | sim | sim | não precisa |
| `#aprovacoes` | saída com botões | sim | sim | não precisa |
| `#reunioes` | saída (fase 2) | sim | sim | não precisa |
| `#cto` | saída (fase 2) | sim | sim | não precisa |
| `#planejamento` | **entrada** | sim | sim | **sim** |
| `#insights` | **entrada** | sim | sim | **sim** |
| `#cobrancas` | **entrada** | sim | sim | **sim** |
| `#pessoas` | **entrada, sigilo** | sim | sim | **sim** |

O Copiloto só considera as mensagens **do seu usuário** (`DISCORD_OWNER_ID`) nos canais de entrada; mensagens de qualquer outra pessoa ou bot são ignoradas. Mesmo assim, não convide ninguém para o servidor.

## 5. Valores que vão para o `.env`

| Onde pegar | Variável |
| --- | --- |
| Bot → Token (Redefinir token) | `DISCORD_BOT_TOKEN` |
| Discord → Configurações → Avançado → Modo desenvolvedor LIGADO; botão direito no servidor → Copiar ID do servidor | `DISCORD_GUILD_ID` |
| Botão direito no seu nome → Copiar ID do usuário | `DISCORD_OWNER_ID` |
| Botão direito em cada canal → Copiar ID do canal | `DISCORD_CANAL_BRIEFING`, `_ALERTAS`, `_APROVACOES`, `_REUNIOES`, `_PESSOAS`, `_CTO`, `_PLANEJAMENTO`, `_INSIGHTS`, `_COBRANCAS` |

## 6. Como conferir

1. Ao iniciar a ponte, o terminal mostra "Bot do Discord conectado". Se mostrar "Comandos / NÃO registrados", falta o escopo `applications.commands`: refaça o convite.
2. Digite `/` no `#planejamento`: devem aparecer `/tarefa`, `/tarefas`, `/marcos` e `/ajuda`.
3. Escreva uma frase em `#insights` e rode `/ajuda`. Se a rotina de captura avisar de "mensagens vazias", o Message Content Intent está desligado.

## 7. Anexo: token do Azure DevOps (PAT), só leitura

Em `dev.azure.com/metanetsistema` → User settings → Personal access tokens → New Token → **Custom defined**. Marque **somente leitura (Read)** nestes escopos (a tradução dos nomes no portal em português pode variar):

| Scope | Em português | Permissão |
| --- | --- | --- |
| **Work Items** | Itens de trabalho | **Read** (Leitura) |
| **Code** | Código | **Read** (Leitura) |
| **Analytics** | Análise | **Read** (Leitura) |
| **Build** (para a T1.12, DORA) | Build | **Read** (Leitura) |
| **Release** (para a T1.12, DORA) | Versão / Release | **Read** (Leitura) |

Nenhum escopo de escrita (Write, Manage, Full access). Defina validade curta e guarde só no `.env` (`AZDO_PAT`).

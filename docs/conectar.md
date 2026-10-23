# Guia de Conexão — Ponte MCP + Grok Bot

Siga este guia do zero para ligar a ponte na sua máquina e conectá-la ao Grok Bot. Tempo estimado: 30 minutos.

## Pré-requisitos

- Node.js 22+ instalado (`node --version`)
- Conta no [Cloudflare](https://cloudflare.com) (gratuita)
- `cloudflared` instalado ([download](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/))
- Bot do Discord criado e token em mãos (ver `checklist-paulo.md`)
- Repositório clonado: `git clone https://github.com/paulolot/copiloto-gestao.git`

## Passo 1 — Configurar variáveis de ambiente

```bash
cd copiloto-gestao
cp .env.example .env
```

Abra `.env` e preencha:

| Variável | O que colocar |
| --- | --- |
| `PONTE_TOKEN` | Gere com: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PONTE_PORT` | Deixe `3333` (ou outra porta livre) |
| `DB_PATH` | Caminho para o arquivo do banco, ex: `./copiloto.db` |
| `VAULT_PATH` | Caminho absoluto da pasta do vault, ex: `/Users/paulo/vault` |
| `DISCORD_BOT_TOKEN` | Token do bot (Discord Developer Portal) |
| `DISCORD_GUILD_ID` | ID do seu servidor Discord (botão direito → Copiar ID do servidor) |
| `DISCORD_OWNER_ID` | Seu ID de usuário no Discord (Configurações → Avançado → Modo desenvolvedor → botão direito no seu nome) |
| `DISCORD_CANAL_*` | ID de cada um dos 9 canais, incluindo `_PLANEJAMENTO`, `_INSIGHTS`, `_COBRANCAS` (botão direito no canal → Copiar ID). Permissões e convite do bot: `docs/discord-configuracao.md` |
| `EMBEDDER` / `INDICE_PATH` | Opcionais (fase 2). `EMBEDDER=local` liga a busca por significado com modelo na sua máquina (antes: `npm install @huggingface/transformers`); `INDICE_PATH` é o arquivo do índice (padrão `<DB_PATH>.indice`) |
| `AZDO_ORG` | `metanetsistema` (fase 1) |
| `AZDO_PAT` | Personal Access Token **somente leitura** (Work Items, Code, Analytics). Só no `.env`: nunca em chat, commit ou URL |
| `AZDO_CAMPO_PARALISADO` / `AZDO_CAMPO_TIPO_BUG` | Nome técnico dos campos Paralisado e Tipo Bug (padrão `Custom.Status` e `Custom.TipoBug`) |
| `AZDO_COLUNAS_IGNORADAS` | Colunas fora de toda métrica (padrão `Ideias,UX`) |
| `AZDO_TIPOS` | Tipos de work item que entram nas métricas (padrão `User Story,Bug`) |
| `AZDO_TIMES` | Times sincronizados, separados por vírgula, pelo id (`fiscal`, `desktop`, `retaguarda`) ou pelo nome da área no Azure DevOps (`Squad Fiscal`, `Squad Desktop`, `Squad Retaguarda WEB`). Padrão: só `fiscal`. Nome desconhecido dá erro |
| `ALERTAS_COM_RESPONSAVEL` | Nome de quem é dono de cada card nos avisos de `#alertas` (padrão ligado; `nao` desliga) |

## Passo 2 — Instalar dependências e testar

```bash
npm install
npm test          # deve passar todos os testes
npm run build     # compila TypeScript
```

## Passo 3 — Inicializar o vault

```bash
# Copiar o template para a pasta do vault
cp -r vault-template/* $VAULT_PATH/

# Se quiser importar sua pasta atual de colaboradores:
npm run importar -- --origem /caminho/pasta-colaboradores --destino $VAULT_PATH --simular
# Se o relatório estiver correto, rode sem --simular para importar de verdade
npm run importar -- --origem /caminho/pasta-colaboradores --destino $VAULT_PATH
```

## Passo 4 — Rodar a ponte

```bash
npm run build && npm start     # o .env é lido automaticamente
# Deve exibir:
# Ponte MCP no ar: http://localhost:3333/mcp
# Saúde: http://localhost:3333/health
```

Teste rapidamente:
```bash
curl http://localhost:3333/health
# {"status":"ok","ts":"..."}

curl -s -X POST http://localhost:3333/mcp \
     -H "Authorization: Bearer SEU_PONTE_TOKEN" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# deve responder com a lista de ferramentas MCP; sem o cabeçalho Authorization, 401
```

## Passo 5 — Criar o túnel com Cloudflare

```bash
# Autenticar (só na primeira vez)
cloudflared tunnel login

# Criar o túnel
cloudflared tunnel create copiloto-gestao

# Criar o arquivo de roteamento
cloudflared tunnel route dns copiloto-gestao copiloto.SEUDOMINIO.com
```

Crie o arquivo `~/.cloudflared/config.yml`:
```yaml
tunnel: <ID-do-tunel>
credentials-file: /Users/paulo/.cloudflared/<ID-do-tunel>.json

ingress:
  - hostname: copiloto.SEUDOMINIO.com
    service: http://localhost:3333
  - service: http_status:404
```

Inicie o túnel:
```bash
cloudflared tunnel run copiloto-gestao
```

> Se não quiser usar um domínio próprio, use o modo de teste:
> `cloudflared tunnel --url http://localhost:3333`
> Isso gera uma URL temporária `https://xxxxx.trycloudflare.com`.

## Passo 6 — Cadastrar no Grok Bot

1. Acesse [grok.com/connectors](https://grok.com/connectors)
2. Clique em **Adicionar conector** → **MCP personalizado**
3. Preencha só o nome e a URL (o conector do Grok não tem campo de cabeçalho):
   - **Nome:** Copiloto Gestão
   - **URL:** `https://copiloto.SEUDOMINIO.com/mcp/SEU_PONTE_TOKEN` (o mesmo token do `.env`, no fim da URL)
   - Se o Grok pedir "credenciais OAuth", a URL está sem o token ou com o token errado.
   - O token na URL pode aparecer em logs: use um token longo e aleatório, nunca o compartilhe e troque-o se vazar. Clientes que aceitam cabeçalho podem usar `Authorization: Bearer` na URL `/mcp`.
4. Clique em **Testar conexão** — deve listar as ferramentas: `ping`, `vault_listar`, `vault_ler`, `vault_buscar`, `vault_criar_nota`, `discord_postar`, `boards_sincronizar`, `boards_saude`, `boards_alertas`, `boards_itens_problema`, `boards_marcos`, `boards_tags`, `marco_definir`, `metricas_time`, `pessoa_registrar`, `pessoa_listar`, `pessoa_ler`, `discord_ler_novas`, `discord_marcar_lido`, `metricas_colaborador`, `metricas_colaboradores`, `tarefa_criar`, `tarefa_listar`, `tarefa_concluir`, `tarefas_postar`, `conquista_registrar`, `mensagem_propor`, `aprovacao_consultar`
5. Salve

## Passo 7 — Rodar o teste de fundação

Abra `grok/rotinas/teste-fundacao.md`, copie o prompt e cole no Grok Bot. Todos os três passos devem retornar OK.

## Passo 8 — Ligar o Azure DevOps (fase 1)

1. Crie o PAT em `dev.azure.com/metanetsistema` → User settings → Personal access tokens, só com **Read** em Work Items, Code e Analytics, e validade curta (renove quando vencer).
2. Coloque `AZDO_ORG` e `AZDO_PAT` no `.env` e reinicie a ponte. Ao subir, ela mostra "Sincronização do Azure DevOps agendada".
3. Peça ao Grok Bot: "chame `boards_sincronizar` do time fiscal". A primeira carga leva 12 semanas de histórico e tudo que está aberto.
4. Confira `boards_saude` contra o board real (itens abertos, bloqueados, bugs). Se os números não batem, veja "Premissas" em `docs/backlog-fase-1.md`: campos Paralisado e Tipo Bug, estados de "pronto" e nomes das áreas.
5. Cadastre as rotinas de `grok/rotinas/`: `briefing-diario.md` (7h30), `resumo-semanal.md` (sexta, 16h) e, se quiser, `observador-boards.md`.

A ponte só **lê** do Azure DevOps. Nenhuma ferramenta escreve em work item, comentário ou repositório.

## Iniciar, parar e reiniciar (Windows)

Na raiz do projeto há dois scripts:

- `iniciar.bat` — para o que já estiver rodando (ponte e túnel), recompila e sobe a ponte e o túnel em duas janelas. Serve também para **reiniciar** (por exemplo, depois de um `git pull`).
- `parar.bat` — só encerra a ponte (o processo na porta 3333) e o `cloudflared`.

Antes, confira que o `.env` está preenchido e que o túnel `copiloto-gestao` existe (passo 5). Para iniciar com o Windows, execute `instalar-inicializacao.bat` uma vez (cria o atalho do `iniciar.bat` em `shell:startup`; `instalar-inicializacao.bat remover` desfaz). O Grok Bot roda na nuvem e não precisa de inicialização: ele alcança a ponte pelo túnel. Se o `cloudflared` não estiver no `PATH`, troque `cloudflared` pelo caminho completo do `.exe` no script. O `parar.bat` encerra **todos** os `cloudflared.exe`.

## Manter a ponte no ar

Para rodar a ponte automaticamente na inicialização do Mac:

```bash
# Criar plist de serviço (substitua os caminhos)
cat > ~/Library/LaunchAgents/com.paulo.copiloto-ponte.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.paulo.copiloto-ponte</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>--env-file=/caminho/para/copiloto-gestao/.env</string>
    <string>/caminho/para/copiloto-gestao/dist/src/ponte/server.js</string>
  </array>
  <key>WorkingDirectory</key><string>/caminho/para/copiloto-gestao</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/copiloto-ponte.log</string>
  <key>StandardErrorPath</key><string>/tmp/copiloto-ponte.err</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.paulo.copiloto-ponte.plist
```

## Solução de problemas

| Problema | Solução |
| --- | --- |
| `PONTE_TOKEN não configurado` | Preencha `PONTE_TOKEN` no `.env` com um token próprio (não o valor de exemplo) |
| `401 Unauthorized` | Confirme que o token no `.env` e no Grok Bot são iguais |
| `VAULT_PATH não configurado` | Variável ausente no `.env` |
| `Área restrita` | Use a ferramenta correta para `pessoas/` |
| Cloudflare 502 | A ponte não está rodando — execute `npm start` |
| Botões de aprovação não aparecem | Confirme `DISCORD_BOT_TOKEN`, `DISCORD_OWNER_ID` e `DISCORD_CANAL_APROVACOES` no `.env` |
| `Azure DevOps não configurado` | Faltam `AZDO_ORG` ou `AZDO_PAT` no `.env` |
| `Azure DevOps respondeu 401` | PAT vencido, errado ou sem escopo de leitura |
| `Azure DevOps respondeu 403/404` | PAT sem acesso ao projeto, ou projeto/área com outro nome (ver `src/ponte/azure/escopo.ts`) |
| `Azure DevOps respondeu 400` na sincronização | Nome técnico errado do campo Paralisado ou Tipo Bug: ajuste `AZDO_CAMPO_PARALISADO` / `AZDO_CAMPO_TIPO_BUG` |
| Boards com números estranhos | Confira o campo Paralisado e os estados de pronto (`Done`, `Closed`, `Resolved`) |
| Discord `DISCORD_BOT_TOKEN` | Verifique se o bot foi convidado para o servidor |

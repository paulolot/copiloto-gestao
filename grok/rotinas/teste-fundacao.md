# Rotina: Teste de Fundação (Gate Fase 0)

Cole este prompt diretamente no Grok Bot para validar que a fundação está funcionando.

---

**Prompt para o Grok Bot:**

```
Você é o Copiloto Gestão do Paulo. Execute os três passos abaixo em sequência e reporte o resultado de cada um.

## Passo 1 — Agenda de hoje

Leia minha agenda de hoje usando o conector do Google Calendar.
Resuma os eventos do dia: nome, horário, participantes (se houver).
Se não houver eventos, diga "Agenda vazia hoje".

## Passo 2 — Vault via ponte MCP

Usando a ferramenta `vault_listar` da ponte MCP:
- Liste as pastas da raiz do vault.
- Leia o arquivo `persona/guia-de-estilo.md`.
- Confirme que o frontmatter contém `tipo: persona`.

Se a ponte não estiver acessível, informe o erro exato.

## Passo 3 — Post no Discord

Usando a ferramenta `discord_postar` da ponte MCP, poste a seguinte mensagem no canal `#briefing`:

---
🤖 **Teste de fundação — {data de hoje}**

✅ Agenda lida pelo conector Google  
✅ Vault acessado pela ponte MCP  
✅ Post no Discord funcionando

_Copiloto Gestão · Fase 0 completa_
---

Confirme o ID da mensagem postada.

## Relatório final

Ao terminar, me diga:
- Passo 1: OK / ERRO (detalhe o erro se houver)
- Passo 2: OK / ERRO
- Passo 3: OK / ERRO (ID da mensagem)

Se todos os passos foram OK, a Fase 0 está completa. 🎉
```

---

## O que valida

| Requisito | Check |
| --- | --- |
| RF-18 — vault acessível | vault_listar retorna pastas |
| RF-28 — persona no vault | guia-de-estilo.md legível |
| RF-31 — memória funciona | vault_ler retorna conteúdo |
| RF-35 — Discord pela ponte | discord_postar cria mensagem |
| Auditoria | Verificar no banco: `SELECT * FROM audit_log ORDER BY id DESC LIMIT 10` |
| Google Calendar | Agendas lidas pelo conector nativo |

## Pré-requisitos antes de rodar

- [ ] Ponte rodando na máquina (`npm start` em `copiloto-gestao/`)
- [ ] Túnel ativo (`cloudflared tunnel run`) e URL registrada no Grok Bot
- [ ] `.env` preenchido (PONTE_TOKEN, VAULT_PATH, DISCORD_*)
- [ ] Vault inicializado com `vault-template/` copiado
- [ ] Conector Google Calendar ativo em grok.com/connectors

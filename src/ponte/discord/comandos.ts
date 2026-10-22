/**
 * Slash commands of the Copiloto server (only the owner, each in its own channels).
 * They write straight to the bridge, so they answer at once, with no routine in between:
 * /tarefa /tarefas /marcos /cobrar /insight /pessoa /ajuda.
 */
import { SlashCommandBuilder } from 'discord.js';
import type { Database } from 'sql.js';
import { logAudit } from '../db/audit.js';
import { marcoListar, statusDoMarco } from '../azure/marcos.js';
import { acharTime } from '../azure/escopo.js';
import { pessoaRegistrar, TIPOS_REGISTRO_PESSOA, vaultCriarNota } from '../tools/vault.js';
import { tarefaCriar, type Prioridade } from '../tools/tarefas.js';
import { ajudaDoCanal, COMANDOS, NOMES_CANAIS, type CanalId, type ComandoDef } from './ajuda.js';
import { mensagemTarefasAbertas, type MensagemTarefas } from './tarefas.js';

const FUSO = 'America/Sao_Paulo';

/** Slash command definitions to register with Discord (JSON). */
export function definicoesSlash(): unknown[] {
  return COMANDOS.map((c) => {
    const b = new SlashCommandBuilder().setName(c.nome).setDescription(c.descricao);
    // Discord requires the required options before the optional ones
    for (const o of [...c.opcoes].sort((a, b2) => Number(b2.obrigatoria) - Number(a.obrigatoria))) {
      b.addStringOption((op) => {
        op.setName(o.nome).setDescription(o.descricao).setRequired(o.obrigatoria);
        if (o.escolhas) op.addChoices(...o.escolhas.map((e) => ({ name: e, value: e })));
        return op;
      });
    }
    return b.toJSON();
  });
}

/** Channel id → channel name, from DISCORD_CANAL_* in the environment. */
export function mapaCanais(env: NodeJS.ProcessEnv = process.env): Map<string, CanalId> {
  const m = new Map<string, CanalId>();
  for (const c of Object.keys(NOMES_CANAIS) as CanalId[]) {
    const id = env[`DISCORD_CANAL_${c.toUpperCase()}`];
    if (id) m.set(id, c);
  }
  return m;
}

/** "hoje", "amanha", "25/10", "25/10/2026" or "2026-10-25" → YYYY-MM-DD (São Paulo time). A day/month already past means next year. */
export function parseData(texto: string, agora = new Date()): string {
  const hojeStr = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(agora); // YYYY-MM-DD
  const hoje = Date.parse(`${hojeStr}T00:00:00Z`);
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const t = texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (t === 'hoje') return hojeStr;
  if (t === 'amanha') return iso(hoje + 86_400_000);
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return valida(m[1], m[2], m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return valida(m[3], m[2], m[1]);
  m = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (m) {
    const ano = Number(hojeStr.slice(0, 4));
    const esteAno = valida(String(ano), m[2], m[1]);
    return esteAno >= hojeStr ? esteAno : valida(String(ano + 1), m[2], m[1]);
  }
  throw new Error(`Não entendi a data "${texto}". Use hoje, amanha, 25/10, 25/10/2026 ou 2026-10-25.`);
}

function valida(a: string, m: string, d: string): string {
  const s = `${a.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const dt = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== s) throw new Error(`Data inválida: ${d}/${m}/${a}`);
  return s;
}

const dataBr = (d: string) => d.split('-').reverse().join('/');

/** The parts of a discord.js slash interaction the handlers use (lets tests pass a simulated one). */
export interface ComandoLike {
  commandName: string;
  channelId: string | null;
  user: { id: string };
  options: { getString(nome: string): string | null };
  reply(o: { content: string; ephemeral?: boolean; components?: MensagemTarefas['components'] }): Promise<unknown>;
}

export interface ComandosDeps {
  db: Database;
  ownerId: string;
  canais: Map<string, CanalId>;
  agora?: () => Date;
}

const def = (nome: string): ComandoDef | undefined => COMANDOS.find((c) => c.nome === nome);

export async function tratarComando(deps: ComandosDeps, i: ComandoLike): Promise<void> {
  const nome = i.commandName;
  const comando = def(nome);
  const audit = (result: 'ok' | 'error', params: Record<string, unknown> = {}, extra: { erro?: string; caminho?: string } = {}) =>
    logAudit(deps.db, { tool: `discord_slash_${nome}`, params, origin: `discord:${i.user.id}`, result, error_msg: extra.erro, restricted_path: extra.caminho });
  const erro = async (msg: string, params?: Record<string, unknown>) => {
    audit('error', params, { erro: msg });
    await i.reply({ content: `⚠️ ${msg}`, ephemeral: true });
  };

  if (!comando) return;
  if (i.user.id !== deps.ownerId) return erro('Só o Paulo pode usar estes comandos.');

  const canal = i.channelId ? deps.canais.get(i.channelId) : undefined;
  if (comando.canais !== 'todos' && (!canal || !comando.canais.includes(canal))) {
    return erro(`/${nome} funciona em ${comando.canais.map((c) => NOMES_CANAIS[c]).join(', ')}.`);
  }
  const agora = deps.agora?.() ?? new Date();
  const str = (n: string) => i.options.getString(n)?.trim() || undefined;

  try {
    switch (nome) {
      case 'ajuda': {
        const alvo = (str('canal') as CanalId | undefined) ?? canal;
        if (!alvo) return erro('Use /ajuda dentro de um canal do Copiloto ou informe o canal.');
        audit('ok', { canal: alvo });
        return void (await i.reply({ content: ajudaDoCanal(alvo), ephemeral: true }));
      }
      case 'tarefa': {
        const titulo = str('titulo')!;
        const prazo = str('prazo') ? parseData(str('prazo')!, agora) : undefined;
        const id = tarefaCriar(deps.db, { titulo, prioridade: (str('prioridade') as Prioridade) ?? 'media', prazo, origem: `/tarefa em ${NOMES_CANAIS[canal!]}` });
        audit('ok', { titulo });
        return void (await i.reply({ content: `✅ Tarefa \`#${id}\` criada: ${titulo}${prazo ? ` (prazo ${dataBr(prazo)})` : ''}` }));
      }
      case 'tarefas': {
        const m = mensagemTarefasAbertas(deps.db);
        audit('ok');
        return void (await i.reply({ content: m.content, components: m.components }));
      }
      case 'marcos': {
        const marcos = marcoListar(deps.db);
        audit('ok');
        if (!marcos.length) return void (await i.reply({ content: 'Nenhum marco registrado. Conte para mim em #planejamento: "marco NFC-e, tag ..., data ...".', ephemeral: true }));
        const linhas = marcos.map((m) => {
          const time = m.timeId ? (acharTime(m.timeId)?.nome ?? m.timeId) : 'todos os times';
          if (m.estado === 'planejado') return `📝 **${m.nome}** (${time}): planejado, regras guardadas (P${m.regras.confianca}), falta tag e data`;
          const s = statusDoMarco(deps.db, m, agora);
          const chance = s.previsao?.probabilidadeAteAData === undefined ? 'sem previsão' : `${Math.round(s.previsao.probabilidadeAteAData * 100)}% de chance`;
          return `${{ ok: '🟢', atencao: '🟡', alto: '🔴', atrasado: '🔴', concluido: '✅', indeterminado: '⚪' }[s.risco ?? 'indeterminado']} **${m.nome}** (${time}): entrega ${dataBr(m.data!)}, ${s.entregues}/${s.totalItens} entregues, ${chance} (regra P${m.regras.confianca})${m.adiamentos ? `, adiado ${m.adiamentos}x` : ''}`;
        });
        return void (await i.reply({ content: `🗓️ **Marcos de entrega** (previsão é estimativa)\n${linhas.join('\n')}` }));
      }
      case 'cobrar': {
        const pessoa = str('pessoa')!;
        const assunto = str('assunto')!;
        const lembrarEm = parseData(str('lembrar_em') ?? 'amanha', agora);
        const id = tarefaCriar(deps.db, { titulo: assunto, cobrarDe: pessoa, lembrarEm, origem: `/cobrar em ${NOMES_CANAIS[canal!]}` });
        audit('ok', { cobrarDe: '[restrito]' });
        return void (await i.reply({ content: `🔔 Anotado \`#${id}\`: cobrar **${pessoa}** — ${assunto}. Lembro você em ${dataBr(lembrarEm)}.` }));
      }
      case 'insight': {
        const texto = str('texto')!;
        const tema = str('tema') ?? (texto.length > 60 ? `${texto.slice(0, 59)}…` : texto);
        const caminho = vaultCriarNota({ tipo: 'insight', titulo: tema, conteudo: texto, fontes: [`/insight em #insights, ${agora.toISOString().slice(0, 10)}`] });
        audit('ok', { tema });
        return void (await i.reply({ content: `💡 Anotado em \`${caminho}\` (para você revisar).` }));
      }
      case 'pessoa': {
        const tipo = str('tipo') as (typeof TIPOS_REGISTRO_PESSOA)[number];
        const caminho = pessoaRegistrar({ pessoa: str('nome')!, tipo, texto: str('texto')!, fonte: `/pessoa em #pessoas, ${agora.toISOString().slice(0, 10)}` });
        // Only the path is answered and logged; the text stays in the restricted area
        audit('ok', { nome: '[restrito]', tipo }, { caminho });
        return void (await i.reply({ content: `🔒 Registrado em \`${caminho}\`. O conteúdo não é repetido aqui.`, ephemeral: true }));
      }
    }
  } catch (e) {
    await erro((e as Error).message, nome === 'pessoa' || nome === 'cobrar' ? {} : undefined);
  }
}

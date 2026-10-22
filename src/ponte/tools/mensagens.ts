/**
 * T1.10i — Messages to other people go through the approval queue
 * `mensagem_propor` never sends anything: it queues the text (level `pede_ok`) and Paulo decides on #aprovacoes.
 * There is no sending handler yet, so an approved item stays `aprovado` and Paulo copies the final text himself.
 */
import type { Database } from 'sql.js';
import { enforcePolicy } from '../middleware/autonomy.js';
import { getQueueItem } from '../db/queue.js';

export const TOOL_MENSAGEM = 'mensagem_propor';
export const CANAIS_MENSAGEM = ['email', 'teams', 'whatsapp', 'discord', 'reuniao', 'outro'] as const;
export type CanalMensagem = (typeof CANAIS_MENSAGEM)[number];

/** Same limit as the edit field on Discord. */
export const MAX_TEXTO = 4000;

export interface MensagemProposta {
  destinatario: string;
  canal: CanalMensagem;
  texto: string;
  motivo: string;
  fontes?: string[];
}

export function mensagemPropor(db: Database, m: MensagemProposta): number {
  const destinatario = m.destinatario.trim();
  const texto = m.texto.trim();
  const motivo = m.motivo.trim();
  if (!destinatario) throw new Error('Informe o destinatário');
  if (!texto) throw new Error('O texto da mensagem está vazio');
  if (texto.length > MAX_TEXTO) throw new Error(`O texto tem ${texto.length} caracteres; o máximo é ${MAX_TEXTO}`);
  if (!motivo) throw new Error('Informe o motivo: por que esta mensagem precisa sair');

  const fontes = (m.fontes ?? []).map((f) => f.trim()).filter(Boolean);
  const policy = enforcePolicy(db, {
    tool: TOOL_MENSAGEM,
    level: 'pede_ok',
    action: `Mensagem para ${destinatario} (${m.canal})`,
    // The text goes to the queue only; the audit log gets who and where, never the text.
    params: { destinatario, canal: m.canal },
    content: texto,
    destination: `${destinatario} (${m.canal})`,
    reason: fontes.length ? `${motivo}\nFontes: ${fontes.join('; ')}` : motivo,
    origin: 'mcp',
  });
  if (!policy.allowed && policy.queued) return policy.queueId;
  throw new Error('reason' in policy ? policy.reason : 'A mensagem não entrou na fila');
}

/** What Paulo decided about a queued item, with the text to use (his edit, if he edited). */
export function aprovacaoConsultar(db: Database, id: number): {
  id: number; estado: string; ferramenta: string; acao: string; destino?: string;
  textoFinal?: string; autorizado: boolean; aviso: string;
} {
  const item = getQueueItem(db, id);
  if (!item) throw new Error(`Item #${id} não existe na fila`);
  const autorizado = ['aprovado', 'editado', 'executado'].includes(item.state);
  const aviso =
    item.state === 'pendente' ? 'Ainda aguardando o OK do Paulo em #aprovacoes. Nada foi enviado.'
    : item.state === 'recusado' ? 'O Paulo recusou. Não envie nem insista.'
    : 'Autorizado pelo Paulo. A ponte ainda não envia mensagens: o Paulo copia o texto final e envia.';
  return {
    id,
    estado: item.state,
    ferramenta: item.tool,
    acao: item.action,
    destino: item.destination ?? undefined,
    textoFinal: autorizado ? (item.state === 'editado' ? (item.edited_content ?? item.content) : item.content) ?? undefined : undefined,
    autorizado,
    aviso,
  };
}

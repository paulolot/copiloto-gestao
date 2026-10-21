/**
 * T1.8 — Achievement log (RF-27)
 * An achievement becomes a vault note of type `conquista` in inbox/ (level `sozinho`, revisado: false),
 * with credit to the team. Credit names teams, not individuals: metrics and recognition stay per team.
 */
import { vaultCriarNota } from './vault.js';

export interface Conquista {
  titulo: string;
  descricao: string;
  times: string[];
  fontes: string[];
}

export function conquistaRegistrar(c: Conquista): string {
  if (!c.fontes.length) throw new Error('Toda conquista cita a fonte (work item, commit, nota ou e-mail)');
  const credito = c.times.length ? `**Crédito:** ${c.times.join(', ')}\n\n` : '';
  return vaultCriarNota({ tipo: 'conquista', titulo: c.titulo, conteudo: `${credito}${c.descricao}`, fontes: c.fontes, times: c.times });
}

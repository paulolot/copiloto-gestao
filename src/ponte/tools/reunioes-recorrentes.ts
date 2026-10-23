/**
 * T2.14 — Reuniões recorrentes que o Paulo cadastra no Discord (#reunioes) e o Copiloto prepara
 * Internal list, so level `sozinho`. The routine `reunioes_recorrentes` asks which ones fall today
 * (`reuniaoRecorrenteHoje`), prepares each and marks it prepared so it is not prepared twice.
 */
import type { Database } from 'sql.js';
import { persist } from '../db/database.js';

const FUSO = 'America/Sao_Paulo';
export const DIAS_SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const;
export const FREQUENCIAS = ['semanal', 'quinzenal'] as const;
export type Frequencia = (typeof FREQUENCIAS)[number];

/** Fields that /reuniao_ajustar and reuniao_recorrente_ajustar can change. */
export const CAMPOS_REUNIAO = ['titulo', 'dia', 'hora', 'frequencia', 'inicio', 'assunto', 'participantes', 'times', 'marco', 'fontes', 'instrucoes'] as const;
export type CampoReuniao = (typeof CAMPOS_REUNIAO)[number];

export interface ReuniaoRecorrente {
  id: number;
  titulo: string;
  dia: (typeof DIAS_SEMANA)[number];
  hora: string;
  frequencia: Frequencia;
  inicio: string;
  assunto: string;
  participantes?: string;
  times?: string;
  marco?: string;
  fontes?: string;
  instrucoes?: string;
  preparadaEm?: string;
}

export interface NovaReuniao {
  titulo: string;
  dia: string;
  hora: string;
  assunto: string;
  frequencia?: string;
  /** AAAA-MM-DD of one occurrence; for a quinzenal meeting it tells which weeks are the ones. Default: the next occurrence. */
  inicio?: string;
  participantes?: string;
  times?: string;
  marco?: string;
  fontes?: string;
  instrucoes?: string;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const sem = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** "terça", "ter", "segunda-feira" → 0..6 (Sunday = 0). */
export function parseDiaSemana(texto: string): number {
  const t = sem(texto).replace(/-feira$/, '');
  const i = DIAS_SEMANA.findIndex((d) => d === t || (t.length >= 3 && d.startsWith(t)));
  if (i < 0) throw new Error(`Não entendi o dia "${texto}". Use segunda, terca, quarta, quinta, sexta, sabado ou domingo.`);
  return i;
}

/** "11", "11h", "11h30", "9:05" → "HH:MM". */
export function parseHora(texto: string): string {
  const m = /^(\d{1,2})(?:[:h](\d{2})?)?$/.exec(sem(texto));
  if (!m) throw new Error(`Não entendi a hora "${texto}". Use 11:00, 11h ou 11h30.`);
  const h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  if (h > 23 || min > 59) throw new Error(`Hora inválida: ${texto}`);
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function parseFrequencia(texto: string): Frequencia {
  const t = sem(texto);
  if (!(FREQUENCIAS as readonly string[]).includes(t)) throw new Error(`Frequência "${texto}" não existe. Use semanal ou quinzenal.`);
  return t as Frequencia;
}

export function hojeSaoPaulo(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(agora);
}

const diaDaData = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const somaDias = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function validaData(d: string, rotulo: string): string {
  if (!DATA.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)) || new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d) throw new Error(`${rotulo} deve ser uma data AAAA-MM-DD`);
  return d;
}

/** First date on or after `desde` that falls on the weekday. */
function proximaOcorrencia(diaSemana: number, desde: string): string {
  return somaDias(desde, (diaSemana - diaDaData(desde) + 7) % 7);
}

function linha(v: unknown[]): ReuniaoRecorrente {
  const o = (x: unknown) => (x as string) ?? undefined;
  return {
    id: v[0] as number, titulo: v[1] as string, dia: DIAS_SEMANA[v[2] as number], hora: v[3] as string, frequencia: v[4] as Frequencia,
    inicio: v[5] as string, assunto: v[6] as string, participantes: o(v[7]), times: o(v[8]), marco: o(v[9]), fontes: o(v[10]), instrucoes: o(v[11]), preparadaEm: o(v[12]),
  };
}
const COLS = 'id, titulo, dia_semana, hora, frequencia, inicio, assunto, participantes, times, marco, fontes, instrucoes, preparada_em';

function obter(db: Database, id: number): ReuniaoRecorrente | undefined {
  const v = db.exec(`SELECT ${COLS} FROM reunioes_recorrentes WHERE id = ?`, [id])[0]?.values[0];
  return v ? linha(v) : undefined;
}

const texto = (t?: string) => t?.trim() || null;

export function reuniaoRecorrenteCadastrar(db: Database, r: NovaReuniao, agora = new Date()): ReuniaoRecorrente {
  const titulo = r.titulo.trim();
  if (!titulo) throw new Error('Informe o título do evento, igual ao que está no Google Calendar');
  if (!r.assunto.trim()) throw new Error('Diga para que serve a reunião (assunto)');
  const dia = parseDiaSemana(r.dia);
  const hora = parseHora(r.hora);
  const frequencia = r.frequencia ? parseFrequencia(r.frequencia) : 'semanal';
  const inicio = r.inicio ? validaData(r.inicio, 'inicio') : proximaOcorrencia(dia, hojeSaoPaulo(agora));
  if (diaDaData(inicio) !== dia) throw new Error(`${inicio} não cai em ${DIAS_SEMANA[dia]}; informe uma data desse dia da semana`);
  if (listar(db).some((x) => sem(x.titulo) === sem(titulo))) throw new Error(`Já existe uma reunião cadastrada com o título "${titulo}"`);
  db.run(`INSERT INTO reunioes_recorrentes (titulo, dia_semana, hora, frequencia, inicio, assunto, participantes, times, marco, fontes, instrucoes) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [titulo, dia, hora, frequencia, inicio, r.assunto.trim(), texto(r.participantes), texto(r.times), texto(r.marco), texto(r.fontes), texto(r.instrucoes)]);
  const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;
  persist(db);
  return obter(db, id)!;
}

function listar(db: Database): ReuniaoRecorrente[] {
  return (db.exec(`SELECT ${COLS} FROM reunioes_recorrentes ORDER BY dia_semana, hora, id`)[0]?.values ?? []).map(linha);
}

export const reuniaoRecorrenteListar = listar;

export function reuniaoRecorrenteAjustar(db: Database, id: number, campo: string, valor: string): ReuniaoRecorrente {
  const atual = obter(db, id);
  if (!atual) throw new Error(`Reunião #${id} não existe`);
  const c = sem(campo) as CampoReuniao;
  if (!CAMPOS_REUNIAO.includes(c)) throw new Error(`Campo "${campo}" não existe. Use: ${CAMPOS_REUNIAO.join(', ')}.`);
  const v = valor.trim();
  if (!v && !['participantes', 'times', 'marco', 'fontes', 'instrucoes'].includes(c)) throw new Error(`O campo ${c} não pode ficar vazio`);

  // Validate everything on a copy and write only at the end
  const novo: ReuniaoRecorrente = { ...atual };
  switch (c) {
    case 'titulo': novo.titulo = v; break;
    case 'dia': novo.dia = DIAS_SEMANA[parseDiaSemana(v)]; break;
    case 'hora': novo.hora = parseHora(v); break;
    case 'frequencia': novo.frequencia = parseFrequencia(v); break;
    case 'inicio': novo.inicio = validaData(v, 'inicio'); break;
    case 'assunto': novo.assunto = v; break;
    default: novo[c] = v || undefined;
  }
  const dia = DIAS_SEMANA.indexOf(novo.dia);
  if (c === 'inicio' && diaDaData(novo.inicio) !== dia) throw new Error(`${novo.inicio} não cai em ${novo.dia}`);
  if (c === 'dia') novo.inicio = proximaOcorrencia(dia, atual.inicio); // keep the reference on the new weekday
  if (c === 'titulo' && listar(db).some((x) => x.id !== id && sem(x.titulo) === sem(v))) throw new Error(`Já existe uma reunião cadastrada com o título "${v}"`);
  // A different day, time or reference date makes the earlier preparation void
  const preparadaEm = c === 'dia' || c === 'inicio' ? null : (atual.preparadaEm ?? null);

  db.run(`UPDATE reunioes_recorrentes SET titulo=?, dia_semana=?, hora=?, frequencia=?, inicio=?, assunto=?, participantes=?, times=?, marco=?, fontes=?, instrucoes=?, preparada_em=? WHERE id=?`,
    [novo.titulo, dia, novo.hora, novo.frequencia, novo.inicio, novo.assunto, texto(novo.participantes), texto(novo.times), texto(novo.marco), texto(novo.fontes), texto(novo.instrucoes), preparadaEm, id]);
  persist(db);
  return obter(db, id)!;
}

export function reuniaoRecorrenteRemover(db: Database, id: number): ReuniaoRecorrente {
  const atual = obter(db, id);
  if (!atual) throw new Error(`Reunião #${id} não existe`);
  db.run('DELETE FROM reunioes_recorrentes WHERE id = ?', [id]);
  persist(db);
  return atual;
}

/** Whether the meeting happens on the date (weekday, and the right week for a quinzenal one). */
export function ocorreEm(r: ReuniaoRecorrente, data: string): boolean {
  if (diaDaData(data) !== DIAS_SEMANA.indexOf(r.dia)) return false;
  if (r.frequencia === 'semanal') return true;
  const dias = Math.round((Date.parse(`${data}T00:00:00Z`) - Date.parse(`${r.inicio}T00:00:00Z`)) / 86_400_000);
  return Math.floor(dias / 7) % 2 === 0;
}

/** Meetings that happen on the date (default: today in São Paulo), by time. Prepared ones are left out unless asked. */
export function reuniaoRecorrenteHoje(db: Database, opts: { data?: string; incluirPreparadas?: boolean; agora?: Date } = {}): { data: string; reunioes: (ReuniaoRecorrente & { jaPreparada: boolean })[] } {
  const data = opts.data ? validaData(opts.data, 'data') : hojeSaoPaulo(opts.agora);
  const reunioes = listar(db)
    .filter((r) => ocorreEm(r, data))
    .map((r) => ({ ...r, jaPreparada: r.preparadaEm === data }))
    .filter((r) => opts.incluirPreparadas || !r.jaPreparada);
  return { data, reunioes };
}

export function reuniaoRecorrenteMarcarPreparada(db: Database, id: number, data?: string, agora = new Date()): ReuniaoRecorrente {
  const r = obter(db, id);
  if (!r) throw new Error(`Reunião #${id} não existe`);
  const d = data ? validaData(data, 'data') : hojeSaoPaulo(agora);
  if (!ocorreEm(r, d)) throw new Error(`A reunião #${id} não acontece em ${d}`);
  db.run('UPDATE reunioes_recorrentes SET preparada_em = ? WHERE id = ?', [d, id]);
  persist(db);
  return obter(db, id)!;
}

/** One line per meeting, for Discord. */
export function resumoReuniao(r: ReuniaoRecorrente): string {
  const dia = `${r.dia}${r.frequencia === 'quinzenal' ? ' (quinzenal)' : ''}`;
  return `\`#${r.id}\` **${r.titulo}** — ${dia}, ${r.hora} · ${r.assunto}${r.participantes ? ` · com ${r.participantes}` : ''}${r.times ? ` · times: ${r.times}` : ''}${r.marco ? ` · marco: ${r.marco}` : ''}${r.fontes ? ' · com fontes' : ''}`;
}

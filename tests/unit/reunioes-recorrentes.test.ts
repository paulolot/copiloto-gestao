/**
 * Reuniões recorrentes: cadastro, ocorrência (semanal e quinzenal), preparo único e comandos do Discord
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import type { Database } from 'sql.js';
import {
  ocorreEm, parseDiaSemana, parseHora, reuniaoRecorrenteAjustar, reuniaoRecorrenteCadastrar, reuniaoRecorrenteHoje,
  reuniaoRecorrenteListar, reuniaoRecorrenteMarcarPreparada, reuniaoRecorrenteRemover,
} from '../../src/ponte/tools/reunioes-recorrentes.js';
import { tratarComando, type ComandoLike } from '../../src/ponte/discord/comandos.js';
import { NOMES_CANAIS, type CanalId } from '../../src/ponte/discord/ajuda.js';
import { makeTestDb } from './helpers.js';

const QUINTA = new Date('2026-10-22T15:00:00Z'); // Thursday 12:00 in São Paulo
let db: Database;
beforeEach(async () => { db = await makeTestDb(); });

const pares = { titulo: 'Reunião gerentes - IMEX', dia: 'segunda', hora: '11h', assunto: 'Boards, times e decisões', participantes: 'Fábio Vendramin, Mateus Bahis' };
const web = { titulo: '[IMEX] Projeto Web', dia: 'sexta', hora: '11:00', assunto: 'Impedimentos e marco', marco: 'Versão clássica 30/11', fontes: 'https://docs.google.com/spreadsheets/d/abc' };

describe('leitura de dia e hora', () => {
  it('understands the ways to write them', () => {
    expect(parseDiaSemana('Terça')).toBe(2);
    expect(parseDiaSemana('sexta-feira')).toBe(5);
    expect(parseDiaSemana('seg')).toBe(1);
    expect(() => parseDiaSemana('amanhã')).toThrow('Não entendi o dia');
    expect(parseHora('11h')).toBe('11:00');
    expect(parseHora('9:05')).toBe('09:05');
    expect(parseHora('14h30')).toBe('14:30');
    expect(() => parseHora('25h')).toThrow('inválida');
    expect(() => parseHora('meio-dia')).toThrow('Não entendi a hora');
  });
});

describe('cadastro', () => {
  it('registers a meeting and starts the reference on the next occurrence', () => {
    const r = reuniaoRecorrenteCadastrar(db, web, QUINTA);
    expect(r).toMatchObject({ titulo: '[IMEX] Projeto Web', dia: 'sexta', hora: '11:00', frequencia: 'semanal', inicio: '2026-10-23', marco: 'Versão clássica 30/11' });
    expect(reuniaoRecorrenteListar(db)).toHaveLength(1);
  });

  it('orders by weekday and time, and refuses a repeated title or missing data', () => {
    reuniaoRecorrenteCadastrar(db, web, QUINTA);
    reuniaoRecorrenteCadastrar(db, pares, QUINTA);
    expect(reuniaoRecorrenteListar(db).map((r) => r.dia)).toEqual(['segunda', 'sexta']);
    expect(() => reuniaoRecorrenteCadastrar(db, { ...pares, titulo: 'reuniao GERENTES - imex' }, QUINTA)).toThrow('Já existe');
    expect(() => reuniaoRecorrenteCadastrar(db, { ...pares, titulo: 'X', assunto: ' ' }, QUINTA)).toThrow('para que serve');
    expect(() => reuniaoRecorrenteCadastrar(db, { ...pares, titulo: 'Y', frequencia: 'mensal' }, QUINTA)).toThrow('semanal ou quinzenal');
    expect(() => reuniaoRecorrenteCadastrar(db, { ...pares, titulo: 'Z', inicio: '2026-10-22' }, QUINTA)).toThrow('não cai em segunda');
  });

  it('adjusts, validates before writing, and removes', () => {
    const r = reuniaoRecorrenteCadastrar(db, pares, QUINTA);
    expect(reuniaoRecorrenteAjustar(db, r.id, 'hora', '14h30').hora).toBe('14:30');
    expect(reuniaoRecorrenteAjustar(db, r.id, 'participantes', '').participantes).toBeUndefined();
    expect(() => reuniaoRecorrenteAjustar(db, r.id, 'hora', 'x')).toThrow();
    expect(reuniaoRecorrenteListar(db)[0].hora).toBe('14:30');
    expect(() => reuniaoRecorrenteAjustar(db, r.id, 'assunto', '')).toThrow('não pode ficar vazio');
    expect(() => reuniaoRecorrenteAjustar(db, r.id, 'cor', 'azul')).toThrow('não existe');
    expect(reuniaoRecorrenteAjustar(db, r.id, 'dia', 'quarta')).toMatchObject({ dia: 'quarta', inicio: '2026-10-28' });
    expect(() => reuniaoRecorrenteAjustar(db, 99, 'hora', '10h')).toThrow('não existe');
    expect(reuniaoRecorrenteRemover(db, r.id).titulo).toBe(pares.titulo);
    expect(reuniaoRecorrenteListar(db)).toHaveLength(0);
  });
});

describe('quando acontece', () => {
  it('weekly meetings fall every week on their weekday', () => {
    const r = reuniaoRecorrenteCadastrar(db, pares, QUINTA); // reference Monday 2026-10-26
    expect(ocorreEm(r, '2026-10-26')).toBe(true);
    expect(ocorreEm(r, '2026-11-02')).toBe(true);
    expect(ocorreEm(r, '2026-10-27')).toBe(false);
  });

  it('biweekly meetings alternate weeks from the reference date, before and after it', () => {
    const r = reuniaoRecorrenteCadastrar(db, { ...pares, titulo: 'Quinzenal', frequencia: 'quinzenal', inicio: '2026-10-26' }, QUINTA);
    expect(ocorreEm(r, '2026-10-26')).toBe(true);
    expect(ocorreEm(r, '2026-11-02')).toBe(false);
    expect(ocorreEm(r, '2026-11-09')).toBe(true);
    expect(ocorreEm(r, '2026-10-19')).toBe(false);
    expect(ocorreEm(r, '2026-10-12')).toBe(true);
  });

  it('hoje lists only today\'s meetings, and a prepared one is not offered again', () => {
    const w = reuniaoRecorrenteCadastrar(db, web, QUINTA);
    reuniaoRecorrenteCadastrar(db, pares, QUINTA);
    const sexta = new Date('2026-10-23T11:00:00Z');
    expect(reuniaoRecorrenteHoje(db, { agora: sexta }).reunioes.map((r) => r.titulo)).toEqual(['[IMEX] Projeto Web']);
    expect(reuniaoRecorrenteHoje(db, { agora: QUINTA }).reunioes).toHaveLength(0);
    reuniaoRecorrenteMarcarPreparada(db, w.id, undefined, sexta);
    expect(reuniaoRecorrenteHoje(db, { agora: sexta }).reunioes).toHaveLength(0);
    expect(reuniaoRecorrenteHoje(db, { agora: sexta, incluirPreparadas: true }).reunioes[0].jaPreparada).toBe(true);
    // next week it is offered again
    expect(reuniaoRecorrenteHoje(db, { data: '2026-10-30' }).reunioes).toHaveLength(1);
    expect(() => reuniaoRecorrenteMarcarPreparada(db, w.id, '2026-10-27')).toThrow('não acontece');
  });

  it('uses the São Paulo day when UTC has already turned', () => {
    reuniaoRecorrenteCadastrar(db, web, QUINTA);
    // Saturday 00:30 UTC is still Friday night in São Paulo
    expect(reuniaoRecorrenteHoje(db, { agora: new Date('2026-10-24T00:30:00Z') }).reunioes).toHaveLength(1);
  });
});

describe('comandos no Discord', () => {
  const CANAIS = new Map<string, CanalId>(Object.keys(NOMES_CANAIS).map((c) => [`ch-${c}`, c as CanalId]));
  const roda = async (nome: string, canal: string, opts: Record<string, string> = {}) => {
    const respostas: { content: string; ephemeral?: boolean }[] = [];
    const i: ComandoLike = { commandName: nome, channelId: `ch-${canal}`, user: { id: '1' }, options: { getString: (n) => opts[n] ?? null }, reply: async (o) => void respostas.push(o) };
    await tratarComando({ db, ownerId: '1', canais: CANAIS, agora: () => QUINTA }, i);
    return respostas;
  };

  it('/reuniao_nova registers, /reuniao_lista shows, /reuniao_ajustar and /reuniao_remover change it', async () => {
    const [n] = await roda('reuniao_nova', 'reunioes', { titulo: web.titulo, dia: 'sexta', hora: '11h', assunto: web.assunto, fontes: web.fontes, marco: web.marco });
    expect(n.content).toContain('[IMEX] Projeto Web');
    const [l] = await roda('reuniao_lista', 'reunioes');
    expect(l.content).toContain('sexta, 11:00');
    const [a] = await roda('reuniao_ajustar', 'reunioes', { id: '1', campo: 'marco', valor: '-' });
    expect(a.content).not.toContain('marco:');
    const [x] = await roda('reuniao_remover', 'reunioes', { id: '1' });
    expect(x.content).toContain('removida');
    expect((await roda('reuniao_lista', 'reunioes'))[0].content).toContain('Nenhuma');
  });

  it('explains instead of registering when something is wrong, and only works in #reunioes', async () => {
    const [e] = await roda('reuniao_nova', 'reunioes', { titulo: 'X', dia: 'sexta', hora: 'tarde', assunto: 'a' });
    expect(e.content).toContain('Não entendi a hora');
    expect(reuniaoRecorrenteListar(db)).toHaveLength(0);
    const [c] = await roda('reuniao_nova', 'insights', { titulo: 'X', dia: 'sexta', hora: '11h', assunto: 'a' });
    expect(c.content).toContain('#reunioes');
    const [i] = await roda('reuniao_ajustar', 'reunioes', { id: 'abc', campo: 'hora', valor: '10h' });
    expect(i.content).toContain('número da reunião');
  });
});

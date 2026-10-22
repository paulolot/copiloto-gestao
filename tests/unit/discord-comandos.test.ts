/**
 * Slash commands, channel help and the generated Discord documentation
 */
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from 'sql.js';
import { ajudaDoCanal, COMANDOS, LIMITE_DESCRICAO_COMANDO, LIMITE_TOPICO, NOMES_CANAIS, TOPICOS, type CanalId } from '../../src/ponte/discord/ajuda.js';
import { definicoesSlash, mapaCanais, parseData, tratarComando, type ComandoLike } from '../../src/ponte/discord/comandos.js';
import { docsDiscord } from '../../src/ponte/discord/docs.js';
import { queryAudit } from '../../src/ponte/db/audit.js';
import { marcoDefinir } from '../../src/ponte/azure/marcos.js';
import { tarefaListar } from '../../src/ponte/tools/tarefas.js';
import { makeTestDb } from './helpers.js';

const OWNER = '111';
const CANAIS = new Map<string, CanalId>(Object.keys(NOMES_CANAIS).map((c) => [`ch-${c}`, c as CanalId]));
const AGORA = new Date('2026-10-22T15:00:00Z'); // Thursday 12:00 in São Paulo
const tmp = mkdtempSync(join(tmpdir(), 'vault-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

let db: Database;
beforeEach(async () => {
  db = await makeTestDb();
  rmSync(tmp, { recursive: true, force: true });
  cpSync(join(process.cwd(), 'tests/fixtures/vault'), tmp, { recursive: true });
  process.env.VAULT_PATH = tmp;
});

function cmd(nome: string, canal: string, opts: Record<string, string> = {}, user = OWNER) {
  const respostas: { content: string; ephemeral?: boolean; components?: unknown[] }[] = [];
  const i: ComandoLike = {
    commandName: nome, channelId: `ch-${canal}`, user: { id: user },
    options: { getString: (n) => opts[n] ?? null },
    reply: async (o) => void respostas.push(o),
  };
  return { i, respostas };
}
const roda = async (nome: string, canal: string, opts?: Record<string, string>, user?: string) => {
  const { i, respostas } = cmd(nome, canal, opts, user);
  await tratarComando({ db, ownerId: OWNER, canais: CANAIS, agora: () => AGORA }, i);
  return respostas;
};

describe('definições dos comandos', () => {
  it('respect the Discord limits and put required options first', () => {
    const defs = definicoesSlash() as { name: string; description: string; options?: { name: string; required?: boolean; description: string }[] }[];
    expect(defs.map((d) => d.name)).toEqual(COMANDOS.map((c) => c.nome));
    for (const d of defs) {
      expect(d.name).toMatch(/^[a-z0-9_-]{1,32}$/);
      expect(d.description.length).toBeLessThanOrEqual(LIMITE_DESCRICAO_COMANDO);
      const req = (d.options ?? []).map((o) => !!o.required);
      expect(req).toEqual([...req].sort((a, b) => Number(b) - Number(a)));
      (d.options ?? []).forEach((o) => expect(o.description.length).toBeLessThanOrEqual(LIMITE_DESCRICAO_COMANDO));
    }
  });

  it('maps channel ids from the environment', () => {
    const m = mapaCanais({ DISCORD_CANAL_INSIGHTS: '77', DISCORD_CANAL_PESSOAS: '88' } as NodeJS.ProcessEnv);
    expect(m.get('77')).toBe('insights');
    expect(m.get('88')).toBe('pessoas');
  });
});

describe('ajuda dos canais e documentação', () => {
  it('every channel has a topic within the 1024-character limit', () => {
    for (const c of Object.keys(NOMES_CANAIS) as CanalId[]) {
      expect(TOPICOS[c]).toBeTruthy();
      expect([...TOPICOS[c]].length).toBeLessThanOrEqual(LIMITE_TOPICO);
    }
  });

  it('a topic mentions exactly the commands that work in that channel, and only existing ones', () => {
    for (const c of Object.keys(NOMES_CANAIS) as CanalId[]) {
      const citados = new Set([...TOPICOS[c].matchAll(/\/([a-z]+)/g)].map((m) => m[1]).filter((n) => COMANDOS.some((x) => x.nome === n)));
      const devem = COMANDOS.filter((x) => x.canais === 'todos' || x.canais.includes(c)).map((x) => x.nome);
      expect([...citados].sort()).toEqual(devem.sort());
    }
  });

  it('the committed docs/discord-canais.md is up to date (run npm run docs:discord)', () => {
    // compared without regard to the line ending the checkout used (CRLF on Windows)
    expect(readFileSync('docs/discord-canais.md', 'utf8').replace(/\r\n/g, '\n')).toBe(docsDiscord());
  });

  it('/ajuda shows the topic and the commands of the channel', async () => {
    const [r] = await roda('ajuda', 'insights');
    expect(r.ephemeral).toBe(true);
    expect(r.content).toContain('#insights');
    expect(r.content).toContain('/insight');
    expect(ajudaDoCanal('pessoas')).toContain('/pessoa');
    const [outro] = await roda('ajuda', 'briefing', { canal: 'cobrancas' });
    expect(outro.content).toContain('#cobrancas');
  });
});

describe('parseData', () => {
  it('understands the usual ways to say a day (São Paulo calendar)', () => {
    expect(parseData('hoje', AGORA)).toBe('2026-10-22');
    expect(parseData('Amanhã', AGORA)).toBe('2026-10-23');
    expect(parseData('25/10', AGORA)).toBe('2026-10-25');
    expect(parseData('5/11/2026', AGORA)).toBe('2026-11-05');
    expect(parseData('2026-12-01', AGORA)).toBe('2026-12-01');
    expect(parseData('15/10', AGORA)).toBe('2027-10-15'); // already past this year
    expect(parseData('22/10', AGORA)).toBe('2026-10-22');
  });

  it('refuses what it does not understand or cannot exist', () => {
    expect(() => parseData('semana que vem', AGORA)).toThrow('Não entendi');
    expect(() => parseData('31/02/2026', AGORA)).toThrow('inválida');
  });

  it('uses the São Paulo day even when UTC has already turned', () => {
    expect(parseData('hoje', new Date('2026-10-23T01:30:00Z'))).toBe('2026-10-22');
  });
});

describe('tratarComando', () => {
  it('answers only the owner, and says why when someone else tries', async () => {
    const [r] = await roda('tarefa', 'planejamento', { titulo: 'x' }, '999');
    expect(r.ephemeral).toBe(true);
    expect(tarefaListar(db)).toHaveLength(0);
    expect(queryAudit(db).some((a) => a.tool === 'discord_slash_tarefa' && a.result === 'error')).toBe(true);
  });

  it('keeps each command in its own channels', async () => {
    const [r] = await roda('pessoa', 'planejamento', { nome: 'Ana', tipo: 'impressao', texto: 'x' });
    expect(r.content).toContain('#pessoas');
    const [s] = await roda('insight', 'briefing', { texto: 'x' });
    expect(s.content).toContain('#insights');
  });

  it('/tarefa creates the task with priority and deadline', async () => {
    const [r] = await roda('tarefa', 'planejamento', { titulo: 'Revisar proposta', prioridade: 'alta', prazo: '25/10' });
    expect(r.content).toContain('Tarefa');
    expect(tarefaListar(db)[0]).toMatchObject({ titulo: 'Revisar proposta', prioridade: 'alta', prazo: '2026-10-25' });
  });

  it('/tarefa with a bad date creates nothing and explains', async () => {
    const [r] = await roda('tarefa', 'planejamento', { titulo: 'x', prazo: 'quando der' });
    expect(r.content).toContain('Não entendi');
    expect(tarefaListar(db)).toHaveLength(0);
  });

  it('/cobrar creates a chase with the person and a reminder (tomorrow by default)', async () => {
    await roda('cobrar', 'cobrancas', { pessoa: 'Ana', assunto: 'laudo da NFC-e' });
    await roda('cobrar', 'cobrancas', { pessoa: 'Pedro', assunto: 'deploy', lembrar_em: '30/10' });
    const [a, p] = tarefaListar(db, { soCobrancas: true });
    expect(a).toMatchObject({ cobrarDe: 'Ana', lembrarEm: '2026-10-23' });
    expect(p).toMatchObject({ cobrarDe: 'Pedro', lembrarEm: '2026-10-30' });
    expect(tarefaListar(db, { lembrarAte: '2026-10-23' }).map((t) => t.cobrarDe)).toEqual(['Ana']);
    // the audit log does not carry who is being chased
    expect(JSON.stringify(queryAudit(db))).not.toContain('Pedro');
  });

  it('/tarefas posts the open tasks with a button each, chases included', async () => {
    await roda('cobrar', 'cobrancas', { pessoa: 'Ana', assunto: 'laudo' });
    const [r] = await roda('tarefas', 'cobrancas');
    expect(r.content).toContain('cobrar de Ana');
    expect(r.components).toHaveLength(1);
  });

  it('/insight writes a note in the inbox, unreviewed', async () => {
    const [r] = await roda('insight', 'insights', { texto: 'O time trava sempre na revisão de segunda', tema: 'fila de revisão' });
    const caminho = /`(inbox\/[^`]+)`/.exec(r.content)![1];
    const nota = readFileSync(join(tmp, caminho), 'utf8');
    expect(nota).toContain('tipo: "insight"');
    expect(nota).toContain('revisado: false');
    expect(nota).toContain('O time trava sempre na revisão de segunda');
  });

  it('/pessoa writes to the restricted area and never repeats or logs the text', async () => {
    const segredo = 'Pareceu desmotivada depois da mudança de escopo';
    const [r] = await roda('pessoa', 'pessoas', { nome: 'Ana Souza', tipo: 'impressao', texto: segredo });
    expect(r.ephemeral).toBe(true);
    expect(r.content).not.toContain(segredo);
    const caminho = /`(pessoas\/[^`]+)`/.exec(r.content)![1];
    expect(caminho).toMatch(/^pessoas\/ana-souza\/\d{4}-\d{2}-\d{2}-impressao\.md$/);
    const nota = readFileSync(join(tmp, caminho), 'utf8');
    expect(nota).toContain(segredo);
    expect(nota).toContain('restrito: true');
    const log = JSON.stringify(queryAudit(db));
    expect(log).not.toContain(segredo);
    expect(log).not.toContain('Ana Souza');
    expect(queryAudit(db).find((a) => a.tool === 'discord_slash_pessoa')!.restricted_path).toBe(caminho);
  });

  it('/pessoa without a configured vault fails with a clear message and writes nothing', async () => {
    delete process.env.VAULT_PATH;
    const [r] = await roda('pessoa', 'pessoas', { nome: 'Ana', tipo: 'conversa', texto: 'x' });
    expect(r.content).toContain('VAULT_PATH');
    expect(existsSync(join(tmp, 'pessoas/ana'))).toBe(false);
  });

  it('/marcos summarises the milestones, planned ones included', async () => {
    const [vazio] = await roda('marcos', 'planejamento');
    expect(vazio.content).toContain('Nenhum marco');
    marcoDefinir(db, { nome: 'Próxima entrega fiscal', timeId: 'fiscal', confianca: 95 });
    marcoDefinir(db, { nome: 'NFC-e', timeId: 'retaguarda', tag: 'entrega-x7', data: '2026-12-15' });
    const [r] = await roda('marcos', 'planejamento');
    expect(r.content).toContain('planejado');
    expect(r.content).toContain('NFC-e');
    expect(r.content).toContain('15/12/2026');
  });
});

/**
 * T2.5 — overdue 1:1s and PDI reviews: simulated clock, per-person cadence, people without 1:1,
 * names/numbers only, dated signals that are never announced in a channel
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from 'sql.js';
import { cadenciaEmDias, hojeSp, sinaisDeUmAUm, umAUmPendentes, TIME_SINAIS_1X1 } from '../../src/ponte/tools/um-a-um.js';
import { atualizarSinais, sinaisAtivos } from '../../src/ponte/azure/alertas.js';
import { executarCiclo } from '../../src/ponte/agendador.js';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { queryAudit } from '../../src/ponte/db/audit.js';
import { fakeFetch } from '../fixtures/azdo/respostas.js';
import { makeTestDb } from './helpers.js';

const HOJE = new Date('2026-10-23T15:00:00Z'); // 2026-10-23 in São Paulo
let raiz: string;
let db: Database;

function grava(rel: string, conteudo: string) {
  const full = join(raiz, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, conteudo);
}
const perfil = (nome: string, cadencia?: string) =>
  `---\ntipo: perfil\npessoa: "${nome}"\n${cadencia ? `cadencia_1x1: ${cadencia}\n` : ''}---\n\nSigilo do perfil de ${nome}.\n`;
const umaUm = (data: string) => `---\ntipo: 1x1\ndata: ${data}\n---\n\nConteúdo sigiloso do 1:1.\n`;

beforeEach(async () => {
  raiz = mkdtempSync(join(tmpdir(), 'vault-1x1-'));
  process.env.VAULT_PATH = raiz;
  db = await makeTestDb();
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

describe('cadenciaEmDias / hojeSp', () => {
  it('understands the named cadences and "N dias", ignoring case and accents', () => {
    expect(cadenciaEmDias('Mensal')).toBe(30);
    expect(cadenciaEmDias('quinzenal')).toBe(14);
    expect(cadenciaEmDias('45 dias')).toBe(45);
    expect(cadenciaEmDias('de vez em quando')).toBeUndefined();
  });
  it('uses the São Paulo date', () => {
    expect(hojeSp(new Date('2026-10-24T02:00:00Z'))).toBe('2026-10-23');
  });
});

describe('umAUmPendentes', () => {
  it('computes lateness against each person\'s own cadence, alphabetically', () => {
    grava('pessoas/zeca/perfil.md', perfil('Zeca Lima', 'quinzenal'));
    grava('pessoas/zeca/1x1/2026-10-15-1x1.md', umaUm('2026-10-15'));
    grava('pessoas/ana/perfil.md', perfil('Ana Souza', 'mensal'));
    grava('pessoas/ana/1x1/2026-08-20-1x1.md', umaUm('2026-08-20'));
    grava('pessoas/ana/1x1/2026-09-01-1x1.md', umaUm('2026-09-01'));
    const r = umAUmPendentes(HOJE);
    expect(r.um_a_um.map((p) => p.pessoa)).toEqual(['Ana Souza', 'Zeca Lima']);
    expect(r.um_a_um[0]).toMatchObject({ ultimo_1x1: '2026-09-01', proximo_previsto: '2026-10-01', dias_atraso: 22, situacao: 'atrasado' });
    expect(r.um_a_um[1]).toMatchObject({ proximo_previsto: '2026-10-29', dias_atraso: -6, situacao: 'em_dia' });
  });

  it('flags a person with a profile but no 1:1 on record', () => {
    grava('pessoas/novo/perfil.md', perfil('Novo Colega'));
    expect(umAUmPendentes(HOJE).um_a_um).toEqual([
      { pessoa: 'Novo Colega', cadencia: 'mensal', ultimo_1x1: null, proximo_previsto: null, dias_atraso: null, situacao: 'sem_registro' },
    ]);
  });

  it('does not count a generated agenda (pauta) as a held 1:1', () => {
    grava('pessoas/ana/perfil.md', perfil('Ana Souza'));
    grava('pessoas/ana/1x1/2026-09-01-1x1.md', umaUm('2026-09-01'));
    grava('pessoas/ana/1x1/2026-10-20-pauta.md', umaUm('2026-10-20'));
    expect(umAUmPendentes(HOJE).um_a_um[0].ultimo_1x1).toBe('2026-09-01');
  });

  it('falls back to monthly with a warning when the cadence or the profile is missing, and skips bare folders', () => {
    grava('pessoas/a/perfil.md', perfil('Ana', 'quando der'));
    grava('pessoas/b/1x1/2026-10-10-1x1.md', umaUm('2026-10-10'));
    grava('pessoas/c/2026-10-01-conversa.md', '---\ntipo: conversa\n---\nx');
    const r = umAUmPendentes(HOJE);
    expect(r.um_a_um.map((p) => p.pessoa)).toEqual(['Ana', 'b']);
    expect(r.um_a_um.every((p) => p.cadencia === 'mensal')).toBe(true);
    expect(r.avisos).toEqual(expect.arrayContaining([
      expect.stringContaining('não reconhecida'), expect.stringContaining('Sem perfil.md em pessoas/b'), '1 pasta(s) em pessoas/ sem perfil.md nem 1:1 foram ignoradas',
    ]));
  });

  it('lists only PDI reviews that are already past due', () => {
    grava('pessoas/ana/perfil.md', perfil('Ana Souza'));
    grava('pessoas/ana/pdi.md', '---\ntipo: pdi\nproxima_revisao: 2026-10-13\n---\n');
    grava('pessoas/bia/perfil.md', perfil('Bia Costa'));
    grava('pessoas/bia/pdi.md', '---\ntipo: pdi\nproxima_revisao: 2026-12-01\n---\n');
    expect(umAUmPendentes(HOJE).pdi_vencidos).toEqual([{ pessoa: 'Ana Souza', proxima_revisao: '2026-10-13', dias_atraso: 10 }]);
  });

  it('never returns note content', () => {
    grava('pessoas/ana/perfil.md', perfil('Ana Souza'));
    grava('pessoas/ana/1x1/2026-09-01-1x1.md', umaUm('2026-09-01'));
    expect(JSON.stringify(umAUmPendentes(HOJE))).not.toMatch(/sigil/i);
  });

  it('returns an empty report when there is no pessoas/ folder', () => {
    expect(umAUmPendentes(HOJE)).toMatchObject({ um_a_um: [], pdi_vencidos: [] });
  });
});

describe('sinaisDeUmAUm', () => {
  beforeEach(() => {
    grava('pessoas/ana/perfil.md', perfil('Ana Souza'));
    grava('pessoas/ana/1x1/2026-09-01-1x1.md', umaUm('2026-09-01')); // 22 days late
    grava('pessoas/ana/pdi.md', '---\ntipo: pdi\nproxima_revisao: 2026-10-13\n---\n');
    grava('pessoas/leo/perfil.md', perfil('Leo Dias'));
    grava('pessoas/leo/1x1/2026-07-01-1x1.md', umaUm('2026-07-01')); // 84 days late: more than one cadence
    grava('pessoas/novo/perfil.md', perfil('Novo Colega'));
  });

  it('builds dated signals: yellow when late, red after a full cadence, plus no-record and PDI', () => {
    const s = Object.fromEntries(sinaisDeUmAUm(HOJE).map((x) => [x.chave, x]));
    expect(s['1x1:ana-souza'].severidade).toBe('amarelo');
    expect(s['1x1:ana-souza'].descricao).toContain('atrasado há 22 dia(s)');
    expect(s['1x1:leo-dias'].severidade).toBe('vermelho');
    expect(s['1x1:novo-colega'].descricao).toContain('Sem 1:1 registrado');
    expect(s['pdi:ana-souza'].descricao).toContain('vencida há 10 dia(s)');
  });

  it('keeps the first-seen date, and a 1:1 that happens resolves the signal', () => {
    atualizarSinais(db, TIME_SINAIS_1X1, sinaisDeUmAUm(HOJE), HOJE);
    const depois = new Date('2026-10-26T15:00:00Z');
    atualizarSinais(db, TIME_SINAIS_1X1, sinaisDeUmAUm(depois), depois);
    expect(sinaisAtivos(db, TIME_SINAIS_1X1).find((x) => x.chave === '1x1:ana-souza')?.desde).toBe(HOJE.toISOString());

    grava('pessoas/ana/1x1/2026-10-26-1x1.md', umaUm('2026-10-26'));
    atualizarSinais(db, TIME_SINAIS_1X1, sinaisDeUmAUm(depois), depois);
    expect(sinaisAtivos(db, TIME_SINAIS_1X1).map((x) => x.chave)).not.toContain('1x1:ana-souza');
  });

  it('are created by the hourly cycle but never announced in a channel', async () => {
    const posts: { canal: string; texto: string }[] = [];
    await executarCiclo({
      db, azdo: new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch() }), postar: async (canal, texto) => void posts.push({ canal, texto }), times: [], agora: HOJE,
    });
    expect(sinaisAtivos(db, TIME_SINAIS_1X1).length).toBeGreaterThan(0);
    expect(posts).toEqual([]);
  });
});

describe('audit', () => {
  it('the cycle leaves no person name in the audit log', async () => {
    grava('pessoas/ana/perfil.md', perfil('Ana Souza'));
    await executarCiclo({ db, azdo: new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch() }), postar: async () => undefined, times: [], agora: HOJE });
    expect(JSON.stringify(queryAudit(db, 50))).not.toContain('Ana');
  });
});

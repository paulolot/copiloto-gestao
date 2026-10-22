/**
 * T2.1 — Semantic index: indexing, search by meaning, filters, reviewed-only, restricted area apart, rebuild
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { IndiceVault, dividir } from '../../src/ponte/vault/indice.js';
import { FakeEmbedder } from './helpers.js';

let raiz: string;
let arquivoIndice: string;

function nota(caminho: string, campos: Record<string, string>, corpo: string) {
  const full = join(raiz, caminho);
  mkdirSync(join(full, '..'), { recursive: true });
  const fm = Object.entries(campos).map(([k, v]) => `${k}: ${v}`).join('\n');
  writeFileSync(full, `---\n${fm}\n---\n\n${corpo}\n`);
}

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'vault-idx-'));
  arquivoIndice = join(raiz, '..', `idx-${Date.now()}-${Math.random()}.sqlite`);
  process.env.VAULT_PATH = raiz;
  nota('reunioes/a.md', { tipo: 'reuniao', titulo: '"Planejamento"', data: '2026-10-01', times: '["Squad Fiscal"]', pessoas: '["Ana Souza"]', revisado: 'true' }, 'Combinamos adiar o deploy da versão fiscal para sexta.');
  nota('reunioes/b.md', { tipo: 'reuniao', titulo: '"Time"', data: '2026-09-01', times: '["Squad Desktop"]', revisado: 'true' }, 'Abrir vaga e agendar entrevista com candidato.');
  nota('inbox/rascunho.md', { tipo: 'conquista', titulo: '"Rascunho"', data: '2026-10-02', revisado: 'false' }, 'Release sem bug externo.');
  nota('pessoas/ana-souza/pdi.md', { tipo: 'pdi', titulo: '"PDI"', data: '2026-09-01', pessoas: '["Ana Souza"]', revisado: 'false' }, 'Mentoria para crescimento de carreira.');
  nota('pessoas/_modelo-pdi.md', { tipo: 'pdi', revisado: 'false' }, 'modelo');
});
afterEach(() => { rmSync(raiz, { recursive: true, force: true }); if (existsSync(arquivoIndice)) unlinkSync(arquivoIndice); });

const abrir = (emb = new FakeEmbedder()) => IndiceVault.abrir(emb, arquivoIndice);

describe('dividir', () => {
  it('keeps paragraphs together up to the limit and splits long ones', () => {
    expect(dividir('um\n\ndois')).toEqual(['um\n\ndois']);
    const longo = dividir('palavra '.repeat(300), 200);
    expect(longo.length).toBeGreaterThan(5);
    expect(longo.every((t) => t.length <= 200)).toBe(true);
  });
});

describe('IndiceVault', () => {
  it('finds by meaning: "release" finds the note about "deploy"', async () => {
    const idx = await abrir();
    const r = await idx.buscar('principal', 'quando sai o release?');
    expect(r[0].caminho).toBe('reunioes/a.md');
    expect(r[0].trecho).toContain('deploy');
  });

  it('keeps unreviewed notes and the restricted area out of the main index', async () => {
    const idx = await abrir();
    const r = await idx.buscar('principal', 'release bug carreira mentoria', { limite: 20 });
    expect(r.map((x) => x.caminho).sort()).toEqual(['reunioes/a.md', 'reunioes/b.md']);
  });

  it('serves the restricted area from its own index, skipping models', async () => {
    const idx = await abrir();
    const r = await idx.buscar('restrito', 'promoção');
    expect(r.map((x) => x.caminho)).toEqual(['pessoas/ana-souza/pdi.md']);
    expect(r[0].revisado).toBe(false);
  });

  it('filters by team, person and date from the frontmatter', async () => {
    const idx = await abrir();
    const q = 'reunião versão vaga';
    expect((await idx.buscar('principal', q, { time: 'squad desktop' })).map((x) => x.caminho)).toEqual(['reunioes/b.md']);
    expect((await idx.buscar('principal', q, { pessoa: 'ana' })).map((x) => x.caminho)).toEqual(['reunioes/a.md']);
    expect((await idx.buscar('principal', q, { desde: '2026-09-15' })).map((x) => x.caminho)).toEqual(['reunioes/a.md']);
    expect((await idx.buscar('principal', q, { ate: '2026-09-15' })).map((x) => x.caminho)).toEqual(['reunioes/b.md']);
  });

  it('is incremental: unchanged notes are not re-embedded; edits, new and removed notes are picked up', async () => {
    const idx = await abrir();
    expect(await idx.sincronizar()).toMatchObject({ indexadas: 3, inalteradas: 0, removidas: 0 });
    expect(await idx.sincronizar()).toMatchObject({ indexadas: 0, inalteradas: 3 });

    nota('reunioes/a.md', { tipo: 'reuniao', titulo: '"Planejamento"', data: '2026-10-01', revisado: 'true' }, 'Agora falamos de contratação.');
    nota('reunioes/c.md', { tipo: 'reuniao', data: '2026-10-03', revisado: 'true' }, 'Nova nota.');
    unlinkSync(join(raiz, 'reunioes/b.md'));
    expect(await idx.sincronizar()).toMatchObject({ indexadas: 2, inalteradas: 1, removidas: 1 });

    // a note marked unreviewed again leaves the main index
    nota('reunioes/c.md', { tipo: 'reuniao', data: '2026-10-03', revisado: 'false' }, 'Nova nota.');
    expect(await idx.sincronizar()).toMatchObject({ removidas: 1 });
  });

  it('rebuilds everything on demand and when the embedder changes; survives a restart from the file', async () => {
    const idx = await abrir();
    await idx.sincronizar();
    expect(await idx.sincronizar(true)).toMatchObject({ indexadas: 3, reconstruido: true });

    const reaberto = await abrir();
    expect(await reaberto.sincronizar()).toMatchObject({ indexadas: 0, inalteradas: 3, reconstruido: false });

    const outro = await abrir(new FakeEmbedder('fake:v2'));
    expect(await outro.sincronizar()).toMatchObject({ indexadas: 3, reconstruido: true });
  });

  it('rebuilds from the notes alone when the index file is lost (RNF-08)', async () => {
    await (await abrir()).sincronizar();
    unlinkSync(arquivoIndice);
    const idx = await abrir();
    expect(await idx.sincronizar()).toMatchObject({ indexadas: 3 });
    expect((await idx.buscar('principal', 'deploy'))[0].caminho).toBe('reunioes/a.md');
  });

  it('rejects an empty query', async () => {
    await expect((await abrir()).buscar('principal', '  ')).rejects.toThrow('vazio');
  });
});

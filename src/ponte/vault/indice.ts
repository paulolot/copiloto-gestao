/**
 * T2.1 — Semantic index of the vault (RF-32), rebuildable from the notes (RNF-08).
 * - Two indexes in one SQLite file: `principal` (only notes with `revisado: true`, never pessoas/)
 *   and `restrito` (everything in pessoas/, reachable only by the restricted tool).
 * - Kept in its own database file so the audit log is not rewritten with vectors on every flush.
 * - Incremental: a note is re-embedded only when its content hash changes; removed or no longer
 *   eligible notes leave the index.
 */
import initSqlJs, { type Database } from 'sql.js';
import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs';
import { join, relative, sep } from 'path';
import { getVaultRoot } from '../tools/vault.js';
import { lerFrontmatter, texto, type ValorFrontmatter } from '../tools/frontmatter.js';
import { normalizar, produto, type Embedder } from './embedder.js';

export type NomeIndice = 'principal' | 'restrito';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const TAMANHO_TRECHO = 800;
const MAX_POR_NOTA = 2;

export interface FiltrosBusca {
  time?: string;
  pessoa?: string;
  /** AAAA-MM-DD, compared with `data` in the frontmatter */
  desde?: string;
  ate?: string;
  limite?: number;
}

export interface ResultadoSemantico {
  caminho: string;
  trecho: string;
  pontuacao: number;
  titulo?: string;
  data?: string;
  revisado: boolean;
}

export interface RelatorioSincronizacao {
  indexadas: number;
  inalteradas: number;
  removidas: number;
  reconstruido: boolean;
}

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const lista = (v: ValorFrontmatter | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

/** Splits a note body into chunks of about TAMANHO_TRECHO characters, on paragraph boundaries. */
export function dividir(corpo: string, max = TAMANHO_TRECHO): string[] {
  const partes: string[] = [];
  let atual = '';
  const fechar = () => { if (atual.trim()) partes.push(atual.trim()); atual = ''; };
  for (const par of corpo.split(/\n\s*\n/)) {
    let p = par.trim();
    if (!p) continue;
    while (p.length > max) {
      let corte = p.lastIndexOf(' ', max);
      if (corte < max / 2) corte = max;
      fechar();
      partes.push(p.slice(0, corte).trim());
      p = p.slice(corte).trim();
    }
    if (atual && atual.length + p.length + 2 > max) fechar();
    atual += (atual ? '\n\n' : '') + p;
  }
  fechar();
  return partes;
}

const paraBlob = (v: Float32Array) => new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
const deBlob = (b: Uint8Array) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

export class IndiceVault {
  private ultimaSincronizacao = 0;
  private emAndamento?: Promise<RelatorioSincronizacao>;

  private constructor(private readonly db: Database, private readonly embedder: Embedder, private readonly arquivo?: string) {}

  static async abrir(embedder: Embedder, arquivo?: string): Promise<IndiceVault> {
    const SQL = await initSqlJs();
    const db = arquivo && existsSync(arquivo) ? new SQL.Database(readFileSync(arquivo)) : new SQL.Database();
    db.run(`
      CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT);
      CREATE TABLE IF NOT EXISTS notas (
        indice TEXT NOT NULL, caminho TEXT NOT NULL, hash TEXT NOT NULL,
        titulo TEXT, data TEXT, times TEXT, pessoas TEXT, revisado INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (indice, caminho)
      );
      CREATE TABLE IF NOT EXISTS trechos (
        indice TEXT NOT NULL, caminho TEXT NOT NULL, ordem INTEGER NOT NULL, trecho TEXT NOT NULL, vetor BLOB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS trechos_nota ON trechos (indice, caminho);
    `);
    return new IndiceVault(db, embedder, arquivo);
  }

  private persistir(): void {
    if (!this.arquivo) return;
    const tmp = `${this.arquivo}.tmp`;
    writeFileSync(tmp, Buffer.from(this.db.export()));
    renameSync(tmp, this.arquivo);
  }

  private limpar(): void {
    this.db.run('DELETE FROM notas; DELETE FROM trechos;');
  }

  /** Scans the vault and brings the indexes up to date. `total` drops everything first. */
  sincronizar(total = false): Promise<RelatorioSincronizacao> {
    this.emAndamento ??= this.executar(total).finally(() => { this.emAndamento = undefined; });
    return this.emAndamento;
  }

  /** Cheap staleness guard for searches: re-syncs at most once per `idadeMaxMs`. */
  async garantirAtualizado(idadeMaxMs = 60_000): Promise<void> {
    if (Date.now() - this.ultimaSincronizacao > idadeMaxMs) await this.sincronizar();
    else if (this.emAndamento) await this.emAndamento;
  }

  private async executar(total: boolean): Promise<RelatorioSincronizacao> {
    const raiz = getVaultRoot();
    const idAtual = this.db.exec("SELECT valor FROM meta WHERE chave = 'embedder'")[0]?.values[0]?.[0] as string | undefined;
    const reconstruir = total || (idAtual !== undefined && idAtual !== this.embedder.id);
    if (reconstruir) this.limpar();
    this.db.run("INSERT OR REPLACE INTO meta (chave, valor) VALUES ('embedder', ?)", [this.embedder.id]);

    const existentes = new Map<string, string>();
    for (const [i, c, h] of this.db.exec('SELECT indice, caminho, hash FROM notas')[0]?.values ?? []) existentes.set(`${i}|${c}`, h as string);

    const vistos = new Set<string>();
    const r: RelatorioSincronizacao = { indexadas: 0, inalteradas: 0, removidas: 0, reconstruido: reconstruir };

    for (const full of arquivosMd(raiz)) {
      const caminho = relative(raiz, full).split(sep).join('/');
      const nome = caminho.slice(caminho.lastIndexOf('/') + 1);
      if (nome.startsWith('_') || statSync(full).size > MAX_FILE_BYTES) continue;
      const conteudo = readFileSync(full, 'utf8');
      const { campos, corpo } = lerFrontmatter(conteudo);
      const indice: NomeIndice = caminho.split('/')[0].toLowerCase() === 'pessoas' ? 'restrito' : 'principal';
      const revisado = texto(campos.revisado) === 'true';
      if (indice === 'principal' && !revisado) continue; // only reviewed notes enter the main index

      const chave = `${indice}|${caminho}`;
      vistos.add(chave);
      const hash = createHash('sha256').update(conteudo).digest('hex');
      if (existentes.get(chave) === hash) { r.inalteradas++; continue; }

      const titulo = texto(campos.titulo);
      const trechos = dividir(corpo);
      const vetores: Float32Array[] = [];
      for (const t of trechos) vetores.push(normalizar(await this.embedder.embed(titulo ? `${titulo}\n${t}` : t, 'documento')));

      this.db.run('DELETE FROM trechos WHERE indice = ? AND caminho = ?', [indice, caminho]);
      this.db.run('INSERT OR REPLACE INTO notas (indice, caminho, hash, titulo, data, times, pessoas, revisado) VALUES (?,?,?,?,?,?,?,?)', [
        indice, caminho, hash, titulo ?? null, texto(campos.data) ?? null,
        JSON.stringify(lista(campos.times).map(sem)), JSON.stringify([...lista(campos.pessoas), ...lista(campos.pessoa)].map(sem)), revisado ? 1 : 0,
      ]);
      trechos.forEach((t, i) => this.db.run('INSERT INTO trechos (indice, caminho, ordem, trecho, vetor) VALUES (?,?,?,?,?)', [indice, caminho, i, t, paraBlob(vetores[i])]));
      r.indexadas++;
    }

    for (const chave of existentes.keys()) {
      if (vistos.has(chave)) continue;
      const [indice, caminho] = [chave.slice(0, chave.indexOf('|')), chave.slice(chave.indexOf('|') + 1)];
      this.db.run('DELETE FROM notas WHERE indice = ? AND caminho = ?', [indice, caminho]);
      this.db.run('DELETE FROM trechos WHERE indice = ? AND caminho = ?', [indice, caminho]);
      r.removidas++;
    }

    this.persistir();
    this.ultimaSincronizacao = Date.now();
    return r;
  }

  async buscar(indice: NomeIndice, consulta: string, f: FiltrosBusca = {}): Promise<ResultadoSemantico[]> {
    if (!consulta.trim()) throw new Error('Texto de busca vazio');
    await this.garantirAtualizado();
    const q = normalizar(await this.embedder.embed(consulta, 'consulta'));
    const time = f.time ? sem(f.time) : undefined;
    const pessoa = f.pessoa ? sem(f.pessoa) : undefined;

    const res = this.db.exec(
      `SELECT t.caminho, t.trecho, t.vetor, n.titulo, n.data, n.times, n.pessoas, n.revisado
       FROM trechos t JOIN notas n ON n.indice = t.indice AND n.caminho = t.caminho WHERE t.indice = ?`, [indice],
    )[0]?.values ?? [];

    const candidatos: ResultadoSemantico[] = [];
    for (const [caminho, trecho, vetor, titulo, data, times, pessoas, revisado] of res) {
      if (time && !(JSON.parse(times as string) as string[]).includes(time)) continue;
      if (pessoa && !(JSON.parse(pessoas as string) as string[]).some((p) => p.includes(pessoa))) continue;
      if (f.desde || f.ate) {
        if (!data) continue;
        if (f.desde && (data as string) < f.desde) continue;
        if (f.ate && (data as string) > f.ate) continue;
      }
      candidatos.push({
        caminho: caminho as string, trecho: trecho as string, pontuacao: produto(q, deBlob(vetor as Uint8Array)),
        titulo: (titulo as string) ?? undefined, data: (data as string) ?? undefined, revisado: revisado === 1,
      });
    }
    candidatos.sort((a, b) => b.pontuacao - a.pontuacao);

    const porNota = new Map<string, number>();
    const saida: ResultadoSemantico[] = [];
    for (const c of candidatos) {
      const n = porNota.get(c.caminho) ?? 0;
      if (n >= MAX_POR_NOTA) continue;
      porNota.set(c.caminho, n + 1);
      saida.push({ ...c, pontuacao: Math.round(c.pontuacao * 1000) / 1000 });
      if (saida.length >= (f.limite ?? 8)) break;
    }
    return saida;
  }
}

function arquivosMd(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.')) return [];
    const full = join(dir, e.name);
    return e.isDirectory() ? arquivosMd(full) : e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md' ? [full] : [];
  });
}

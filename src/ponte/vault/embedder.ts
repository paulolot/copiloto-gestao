/**
 * T2.1 — Embedding model behind an interface, so the index does not care where vectors come from.
 * The real one runs locally (decided by Paulo on 22/10/2026): no note text leaves the machine.
 * Tests use a deterministic fake (tests/unit/helpers.ts).
 */
export type UsoEmbedding = 'consulta' | 'documento';

export interface Embedder {
  /** Identifies model + settings; when it changes the whole index is rebuilt. */
  readonly id: string;
  /** Returns a vector (any length, normalized by the caller). */
  embed(texto: string, uso?: UsoEmbedding): Promise<number[]>;
}

export function normalizar(v: ArrayLike<number>): Float32Array {
  const out = Float32Array.from(v as ArrayLike<number>);
  let n = 0;
  for (const x of out) n += x * x;
  n = Math.sqrt(n);
  if (n > 0) for (let i = 0; i < out.length; i++) out[i] /= n;
  return out;
}

/** Dot product; with normalized vectors it is the cosine similarity. */
export function produto(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

const MODELO_PADRAO = 'Xenova/multilingual-e5-small';

/**
 * Local model through transformers.js (ONNX, CPU). It is not a hard dependency: install it on Paulo's
 * machine with `npm install @huggingface/transformers`. The model (~120 MB) is downloaded once.
 * E5 models expect the "query: " / "passage: " prefixes.
 */
export class LocalEmbedder implements Embedder {
  readonly id: string;
  private extrator?: Promise<(t: string, o: object) => Promise<{ data: ArrayLike<number> }>>;

  constructor(private readonly modelo = process.env.EMBEDDER_MODELO ?? MODELO_PADRAO) {
    this.id = `local:${modelo}`;
  }

  private carregar() {
    this.extrator ??= (async () => {
      const pacote = '@huggingface/transformers'; // variable name: keeps tsc from requiring the package
      let mod: { pipeline: (tarefa: string, modelo: string) => Promise<(t: string, o: object) => Promise<{ data: ArrayLike<number> }>> };
      try { mod = await import(pacote); }
      catch { throw new Error('Modelo local não instalado. Rode `npm install @huggingface/transformers` na máquina da ponte (veja docs/conectar.md).'); }
      return mod.pipeline('feature-extraction', this.modelo);
    })();
    return this.extrator;
  }

  async embed(texto: string, uso: UsoEmbedding = 'documento'): Promise<number[]> {
    const extrair = await this.carregar();
    const r = await extrair(`${uso === 'consulta' ? 'query' : 'passage'}: ${texto}`, { pooling: 'mean', normalize: true });
    return Array.from(r.data);
  }
}

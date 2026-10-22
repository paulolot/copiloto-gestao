/**
 * Delivery forecast by percentiles (Monte Carlo on the team's own weekly throughput)
 * No averages: the question is "with what probability do the open items finish by the date?" and
 * "by which date do we finish with P50 / P85 / P95 confidence?". The weekly throughput of the last
 * weeks is resampled with a seeded generator, so the same data gives the same answer on the same day.
 */
const DIA = 86_400_000;
const SEMANAS_MAX = 156;

/** Percentile with linear interpolation; p in 0..100. */
export function percentil(valores: number[], p: number): number | undefined {
  const v = valores.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return undefined;
  const pos = (Math.min(Math.max(p, 0), 100) / 100) * (v.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round((v[lo] + (v[hi] - v[lo]) * (pos - lo) + 1e-9) * 10) / 10;
}

export interface Percentis {
  p50?: number;
  p85?: number;
  p95?: number;
  amostras: number;
}
export const percentis = (valores: number[]): Percentis => {
  const v = valores.filter((n) => Number.isFinite(n) && n >= 0);
  return { p50: percentil(v, 50), p85: percentil(v, 85), p95: percentil(v, 95), amostras: v.length };
};

/** Small seeded PRNG (mulberry32). */
export function gerador(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Previsao {
  semanasDeHistorico: number;
  vazaoSemanal: number[];                 // itens concluídos por semana, da mais antiga à mais recente
  itensRestantes: number;
  probabilidadeAteAData?: number;         // 0..1
  /** Completion date at each confidence level; undefined when it does not finish within 3 years at this pace. */
  dataP50?: string;
  dataP85?: string;
  dataP95?: string;
  /** Completion date at the confidence level the milestone asks for (its `confianca` rule). */
  dataNaConfianca?: string;
  semMovimento: boolean;                  // no item finished in the whole window
}

export function preverEntrega(o: {
  vazao: number[];
  itens: number;
  semanasAteData: number;
  agora: Date;
  seed: number;
  confianca?: number;
  simulacoes?: number;
}): Previsao {
  const base: Previsao = { semanasDeHistorico: o.vazao.length, vazaoSemanal: o.vazao, itensRestantes: o.itens, semMovimento: !o.vazao.some((n) => n > 0) };
  if (o.itens <= 0) return { ...base, probabilidadeAteAData: 1 };
  if (!o.vazao.length || base.semMovimento) return { ...base, probabilidadeAteAData: o.vazao.length ? 0 : undefined };

  const rnd = gerador(o.seed);
  const n = o.simulacoes ?? 10_000;
  const semanas: number[] = [];
  let noPrazo = 0;
  for (let s = 0; s < n; s++) {
    let acumulado = 0;
    let t = Infinity;
    for (let k = 1; k <= SEMANAS_MAX; k++) {
      const amostra = o.vazao[Math.floor(rnd() * o.vazao.length)];
      if (acumulado + amostra >= o.itens) {
        t = k - 1 + (o.itens - acumulado) / amostra; // fraction of the last week
        break;
      }
      acumulado += amostra;
    }
    semanas.push(t);
    if (t <= o.semanasAteData) noPrazo++;
  }
  const data = (p: number) => {
    const w = [...semanas].sort((a, b) => a - b)[Math.min(n - 1, Math.floor((p / 100) * n))];
    return Number.isFinite(w) ? new Date(o.agora.getTime() + w * 7 * DIA).toISOString().slice(0, 10) : undefined;
  };
  return { ...base, probabilidadeAteAData: Math.round((noPrazo / n) * 1000) / 1000, dataP50: data(50), dataP85: data(85), dataP95: data(95), ...(o.confianca ? { dataNaConfianca: data(o.confianca) } : {}) };
}

/**
 * Percentiles and the probabilistic forecast
 */
import { describe, it, expect } from '@jest/globals';
import { percentil, percentis, preverEntrega } from '../../src/ponte/azure/previsao.js';

const AGORA = new Date('2026-10-21T12:00:00Z');

describe('percentis', () => {
  it('interpolates between samples', () => {
    expect(percentil([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentil([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentil([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 85)).toBe(86.5);
    expect(percentil([], 85)).toBeUndefined();
  });

  it('gives P50, P85 and P95 with the sample count and drops invalid values', () => {
    const r = percentis([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, NaN, -1]);
    expect(r).toEqual({ p50: 5.5, p85: 8.7, p95: 9.6, amostras: 10 });
  });
});

describe('preverEntrega', () => {
  const base = { agora: AGORA, seed: 42 };

  it('is deterministic for the same seed', () => {
    const a = preverEntrega({ ...base, vazao: [3, 5, 2, 4], itens: 20, semanasAteData: 6 });
    const b = preverEntrega({ ...base, vazao: [3, 5, 2, 4], itens: 20, semanasAteData: 6 });
    expect(a).toEqual(b);
  });

  it('is certain when nothing is left, and impossible when nothing ever finishes', () => {
    expect(preverEntrega({ ...base, vazao: [3, 4], itens: 0, semanasAteData: 1 }).probabilidadeAteAData).toBe(1);
    const parado = preverEntrega({ ...base, vazao: [0, 0, 0], itens: 5, semanasAteData: 50 });
    expect(parado).toMatchObject({ probabilidadeAteAData: 0, semMovimento: true });
    expect(parado.dataP85).toBeUndefined();
  });

  it('has no opinion without any history', () => {
    expect(preverEntrega({ ...base, vazao: [], itens: 5, semanasAteData: 4 }).probabilidadeAteAData).toBeUndefined();
  });

  it('a steady pace of 5 per week finishes 20 items in 4 weeks, never in 3', () => {
    const r = preverEntrega({ ...base, vazao: [5, 5, 5, 5], itens: 20, semanasAteData: 4 });
    expect(r.probabilidadeAteAData).toBe(1);
    expect(r.dataP95).toBe('2026-11-18'); // exactly 4 weeks
    expect(preverEntrega({ ...base, vazao: [5, 5, 5, 5], itens: 20, semanasAteData: 3 }).probabilidadeAteAData).toBe(0);
  });

  it('higher confidence means a later date, and the date of the asked confidence is returned', () => {
    const r = preverEntrega({ ...base, vazao: [1, 8, 0, 6, 2, 9, 3, 0], itens: 40, semanasAteData: 8, confianca: 85 });
    expect(r.dataP50! <= r.dataP85! && r.dataP85! <= r.dataP95!).toBe(true);
    expect(r.dataNaConfianca).toBe(r.dataP85);
  });

  it('more items or less time lowers the chance', () => {
    const v = [2, 4, 3, 5, 1, 4];
    const p = (itens: number, sem: number) => preverEntrega({ ...base, vazao: v, itens, semanasAteData: sem }).probabilidadeAteAData!;
    expect(p(10, 6)).toBeGreaterThan(p(30, 6));
    expect(p(20, 8)).toBeGreaterThan(p(20, 4));
  });
});

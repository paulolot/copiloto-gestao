/**
 * T0.8 — vault-template notes have valid, standard frontmatter
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(process.cwd(), 'vault-template');

function mdFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? mdFiles(p) : n.endsWith('.md') && n !== 'README.md' ? [p] : [];
  });
}

describe('vault-template', () => {
  const files = mdFiles(ROOT);

  it('has the expected folders', () => {
    const dirs = readdirSync(ROOT).filter((n) => statSync(join(ROOT, n)).isDirectory());
    expect(dirs).toEqual(expect.arrayContaining(['inbox', 'reunioes', 'decisoes', 'times', 'produtos', 'pessoas', 'papeis', 'cto', 'persona', 'conquistas']));
  });

  it.each(files.map((f) => [f.replace(ROOT + '/', ''), f]))('%s has a closed frontmatter with tipo', (_n, f) => {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(f, 'utf8'));
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/^tipo:/m);
  });
});

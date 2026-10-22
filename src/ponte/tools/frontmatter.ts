/**
 * Minimal frontmatter reader for vault notes: `chave: valor`, inline lists (`[a, "b"]`)
 * and bullet lists. Enough for the notes this project writes; not a general YAML parser.
 */
export type ValorFrontmatter = string | string[];

function valor(bruto: string): string {
  const v = bruto.trim();
  if (v.startsWith('"')) {
    try { return JSON.parse(v) as string; } catch { /* fall through */ }
  }
  return v.replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1');
}

function listaInline(v: string): string[] {
  const miolo = v.trim().slice(1, -1).trim();
  if (!miolo) return [];
  const itens: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < miolo.length; i++) {
    const c = miolo[i];
    if (c === '"' && miolo[i - 1] !== '\\') aspas = !aspas;
    if (c === ',' && !aspas) { itens.push(atual); atual = ''; } else atual += c;
  }
  itens.push(atual);
  return itens.map(valor).filter(Boolean);
}

export function lerFrontmatter(conteudo: string): { campos: Record<string, ValorFrontmatter>; corpo: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(conteudo);
  if (!m) return { campos: {}, corpo: conteudo };
  const campos: Record<string, ValorFrontmatter> = {};
  let chaveLista: string | undefined;
  for (const linha of m[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(linha);
    if (item && chaveLista) { (campos[chaveLista] as string[]).push(valor(item[1])); continue; }
    const kv = /^([\w-]+):\s*(.*)$/.exec(linha);
    if (!kv) continue;
    const [, chave, v] = kv;
    if (v.trim().startsWith('[')) { campos[chave] = listaInline(v); chaveLista = undefined; }
    else if (v.trim() === '') { campos[chave] = []; chaveLista = chave; }
    else { campos[chave] = valor(v); chaveLista = undefined; }
  }
  return { campos, corpo: conteudo.slice(m[0].length) };
}

export function texto(v: ValorFrontmatter | undefined): string | undefined {
  return Array.isArray(v) ? v.join(', ') || undefined : v || undefined;
}

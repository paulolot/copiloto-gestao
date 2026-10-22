/**
 * T1.1 — Scope of the three teams (plano.md → Escopo inicial)
 * Teams listed in AZDO_TIMES (comma separated) are synced; default is only the first one.
 * Each entry is the team id (`fiscal`), its name or its Azure DevOps area path (`Squad Fiscal`, `Metanet\\Squad Fiscal`).
 */
export interface RepoRef {
  projeto: string;
  repo: string;
}

export interface TimeEscopo {
  id: string;
  nome: string;
  /** Project that holds the board (work items). */
  projeto: string;
  areaPath: string;
  repos: RepoRef[];
}

export const TIMES: TimeEscopo[] = [
  {
    id: 'fiscal',
    nome: 'Squad Fiscal',
    projeto: 'Metanet',
    areaPath: 'Metanet\\Squad Fiscal',
    repos: [{ projeto: 'Metanet', repo: 'projeto-metaposto-net.git' }],
  },
  {
    id: 'desktop',
    nome: 'Squad Desktop',
    projeto: 'Metanet',
    areaPath: 'Metanet\\Squad Desktop',
    repos: [
      { projeto: 'ATXDados', repo: 'AtxDados-DB' },
      ...['AtxExec', 'AtxRelat', 'EAtxFiscal', 'AtxNFSe', 'Admin'].map((repo) => ({ projeto: 'AutoXPert', repo })),
    ],
  },
  {
    id: 'retaguarda',
    nome: 'Squad Retaguarda WEB',
    projeto: 'Metanet',
    areaPath: 'Metanet\\Squad Retaguarda WEB',
    repos: ['RetaguardaWeb_angular-client', 'RetaguardaWeb_servidor-nest', 'BackendWeb_atxdados'].map((repo) => ({
      projeto: 'Metanet',
      repo,
    })),
  },
];

/**
 * Work item types the boards show and the metrics count: User Story and Bug.
 * Features, Epics, Atendimentos (and Tasks) are not on the board and count nowhere.
 * Override with AZDO_TIPOS (comma separated).
 */
export function tiposContados(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.AZDO_TIPOS ?? 'User Story,Bug').split(',').map((s) => s.trim()).filter(Boolean);
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Matches id, name, area path or the last segment of the area path (the name shown in Azure DevOps), ignoring case and accents. */
export function acharTime(ref: string): TimeEscopo | undefined {
  const k = normalizar(ref.replace(/\//g, '\\'));
  return TIMES.find((t) => {
    const area = normalizar(t.areaPath);
    return [t.id, t.nome, t.areaPath, area.split('\\').pop() ?? ''].some((c) => normalizar(c) === k);
  });
}

export function timesAtivos(env: NodeJS.ProcessEnv = process.env): TimeEscopo[] {
  const refs = (env.AZDO_TIMES ?? 'fiscal').split(',').map((s) => s.trim()).filter(Boolean);
  return refs.map((ref) => {
    const t = acharTime(ref);
    if (!t) throw new Error(`AZDO_TIMES: time desconhecido "${ref}". Use: ${TIMES.map((x) => `${x.id} (${x.nome})`).join(', ')}`);
    return t;
  });
}

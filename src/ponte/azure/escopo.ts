/**
 * T1.1 — Scope of the three teams (plano.md → Escopo inicial)
 * Teams listed in AZDO_TIMES (comma separated ids) are synced; default is only the first one.
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
    repos: [{ projeto: 'Metanet', repo: 'projeto-metaposto-net' }],
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

export function timesAtivos(env: NodeJS.ProcessEnv = process.env): TimeEscopo[] {
  const ids = (env.AZDO_TIMES ?? 'fiscal').split(',').map((s) => s.trim()).filter(Boolean);
  return TIMES.filter((t) => ids.includes(t.id));
}

export function acharTime(idOuNome: string): TimeEscopo | undefined {
  const k = idOuNome.trim().toLowerCase();
  return TIMES.find((t) => t.id === k || t.nome.toLowerCase() === k);
}

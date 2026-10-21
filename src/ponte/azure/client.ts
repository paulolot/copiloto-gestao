/**
 * T1.1 — Azure DevOps client (read only)
 * Only GET requests and the WIQL query (a POST that reads). The PAT never leaves this file:
 * errors carry the status and the path, never headers or the token.
 */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface WorkItem {
  id: number;
  tipo: string;
  estado: string;
  titulo: string;
  areaPath: string;
  iterationPath: string;
  criadoEm: string;
  alteradoEm: string;
  mudancaEstadoEm?: string;
  ativadoEm?: string;
  fechadoEm?: string;
  pontos?: number;
  tags: string[];
  temDono: boolean;
  /** Field "Paralisado": the item is blocked. */
  paralisado: boolean;
  /** Field "Tipo Bug" of Bug items: "Bug Interno" or "Bug Externo" (production). */
  tipoBug?: string;
  /** Owner identity, kept only for aggregate WIP; never returned by tools. */
  dono?: string;
}

export interface Iteracao {
  caminho: string;
  nome: string;
  inicio?: string;
  fim?: string;
}

export interface Commit {
  id: string;
  data: string;
}

export interface PullRequest {
  id: number;
  estado: string;
  criadoEm: string;
  fechadoEm?: string;
}

/** Reference names of the custom fields; override with AZDO_CAMPO_PARALISADO and AZDO_CAMPO_TIPO_BUG. */
export interface Campos {
  paralisado: string;
  tipoBug: string;
}
export function camposDoAmbiente(env: NodeJS.ProcessEnv = process.env): Campos {
  return { paralisado: env.AZDO_CAMPO_PARALISADO || 'Custom.Paralisado', tipoBug: env.AZDO_CAMPO_TIPO_BUG || 'Custom.TipoBug' };
}

export interface AzdoOptions {
  org: string;
  campos?: Campos;
  pat: string;
  fetch?: FetchLike;
  baseUrl?: string;
  timeoutMs?: number;
}

const API = 'api-version=7.1';
const FIELDS = [
  'System.Id', 'System.WorkItemType', 'System.State', 'System.Title', 'System.AreaPath', 'System.IterationPath',
  'System.CreatedDate', 'System.ChangedDate', 'System.AssignedTo', 'System.Tags', 'System.StateChangeDate',
  'Microsoft.VSTS.Common.ActivatedDate', 'Microsoft.VSTS.Common.ClosedDate',
  'Microsoft.VSTS.Scheduling.StoryPoints', 'Microsoft.VSTS.Scheduling.Effort',
];

export class AzdoClient {
  private readonly auth: string;
  private readonly fetchFn: FetchLike;
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly campos: Campos;

  constructor(opts: AzdoOptions) {
    if (!opts.pat) throw new Error('AZDO_PAT não configurado');
    if (!opts.org) throw new Error('AZDO_ORG não configurado');
    this.auth = 'Basic ' + Buffer.from(`:${opts.pat}`).toString('base64');
    this.fetchFn = opts.fetch ?? fetch;
    this.base = (opts.baseUrl ?? 'https://dev.azure.com').replace(/\/$/, '') + '/' + encodeURIComponent(opts.org);
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.campos = opts.campos ?? camposDoAmbiente();
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const resp = await this.fetchFn(this.base + path, {
      ...init,
      headers: { Authorization: this.auth, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!resp.ok) {
      throw new Error(`Azure DevOps respondeu ${resp.status} em ${path.split('?')[0]}`);
    }
    return (await resp.json()) as T;
  }

  /** Ids of work items under the area path: open ones, plus any changed since `desde` (ISO date). */
  async consultarIds(projeto: string, areaPath: string, opts: { desde?: string; apenasAlterados?: boolean }): Promise<number[]> {
    const area = areaPath.replace(/'/g, "''");
    const alterado = opts.desde ? `[System.ChangedDate] >= '${opts.desde.slice(0, 10)}'` : '';
    const aberto = `[System.State] NOT IN ('Done','Closed','Resolved','Removed')`;
    const cond = opts.apenasAlterados && alterado ? alterado : [aberto, alterado].filter(Boolean).join(' OR ');
    const query = `SELECT [System.Id] FROM WorkItems WHERE [System.AreaPath] UNDER '${area}' AND [System.State] <> 'Removed' AND (${cond}) ORDER BY [System.ChangedDate] DESC`;
    const r = await this.request<{ workItems: { id: number }[] }>(
      `/${encodeURIComponent(projeto)}/_apis/wit/wiql?${API}&$top=19000`,
      { method: 'POST', body: JSON.stringify({ query }) },
    );
    return r.workItems.map((w) => w.id);
  }

  async workItems(ids: number[]): Promise<WorkItem[]> {
    const out: WorkItem[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);
      const r = await this.request<{ value: { id: number; fields: Record<string, unknown> }[] }>(
        `/_apis/wit/workitemsbatch?${API}`,
        { method: 'POST', body: JSON.stringify({ ids: lote, fields: [...FIELDS, this.campos.paralisado, this.campos.tipoBug] }) },
      );
      out.push(...r.value.map((w) => normalizarWorkItem(w, this.campos)));
    }
    return out;
  }

  async iteracoes(projeto: string): Promise<Iteracao[]> {
    type Node = { name: string; path?: string; attributes?: { startDate?: string; finishDate?: string }; children?: Node[] };
    const raiz = await this.request<Node>(`/${encodeURIComponent(projeto)}/_apis/wit/classificationnodes/iterations?$depth=5&${API}`);
    const out: Iteracao[] = [];
    const walk = (n: Node, caminho: string) => {
      const atual = caminho ? `${caminho}\\${n.name}` : n.name;
      if (n.attributes?.startDate) out.push({ caminho: atual, nome: n.name, inicio: n.attributes.startDate, fim: n.attributes.finishDate });
      n.children?.forEach((c) => walk(c, atual));
    };
    walk(raiz, '');
    return out;
  }

  async commits(projeto: string, repo: string, desde: string): Promise<Commit[]> {
    const out: Commit[] = [];
    for (let skip = 0; ; skip += 1000) {
      const r = await this.request<{ value: { commitId: string; committer: { date: string } }[] }>(
        `/${encodeURIComponent(projeto)}/_apis/git/repositories/${encodeURIComponent(repo)}/commits?searchCriteria.fromDate=${encodeURIComponent(desde)}&searchCriteria.$top=1000&searchCriteria.$skip=${skip}&${API}`,
      );
      out.push(...r.value.map((c) => ({ id: c.commitId, data: c.committer.date })));
      if (r.value.length < 1000) return out;
    }
  }

  async pullRequests(projeto: string, repo: string): Promise<PullRequest[]> {
    const out: PullRequest[] = [];
    for (let skip = 0; ; skip += 100) {
      const r = await this.request<{ value: { pullRequestId: number; status: string; creationDate: string; closedDate?: string }[] }>(
        `/${encodeURIComponent(projeto)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullrequests?searchCriteria.status=all&$top=100&$skip=${skip}&${API}`,
      );
      out.push(...r.value.map((p) => ({ id: p.pullRequestId, estado: p.status, criadoEm: p.creationDate, fechadoEm: p.closedDate })));
      if (r.value.length < 100) return out;
    }
  }
}

/** Yes/no fields come as boolean, "Sim"/"Yes"/"True" or a picklist value. */
export function ehVerdadeiro(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v !== 'string') return false;
  return !['', 'não', 'nao', 'no', 'false', '0', 'n/a'].includes(v.trim().toLowerCase());
}

export function normalizarWorkItem(w: { id: number; fields: Record<string, unknown> }, campos: Campos = camposDoAmbiente()): WorkItem {
  const f = w.fields;
  const str = (k: string) => (typeof f[k] === 'string' ? (f[k] as string) : undefined);
  const dono = f['System.AssignedTo'];
  const donoNome = typeof dono === 'string' ? dono : (dono as { uniqueName?: string; displayName?: string } | undefined)?.uniqueName ?? (dono as { displayName?: string } | undefined)?.displayName;
  const pontos = f['Microsoft.VSTS.Scheduling.StoryPoints'] ?? f['Microsoft.VSTS.Scheduling.Effort'];
  return {
    id: w.id,
    tipo: str('System.WorkItemType') ?? '',
    estado: str('System.State') ?? '',
    titulo: str('System.Title') ?? '',
    areaPath: str('System.AreaPath') ?? '',
    iterationPath: str('System.IterationPath') ?? '',
    criadoEm: str('System.CreatedDate') ?? '',
    alteradoEm: str('System.ChangedDate') ?? '',
    mudancaEstadoEm: str('System.StateChangeDate'),
    ativadoEm: str('Microsoft.VSTS.Common.ActivatedDate'),
    fechadoEm: str('Microsoft.VSTS.Common.ClosedDate'),
    pontos: typeof pontos === 'number' ? pontos : undefined,
    tags: (str('System.Tags') ?? '').split(';').map((t) => t.trim()).filter(Boolean),
    temDono: !!donoNome,
    paralisado: ehVerdadeiro(f[campos.paralisado]),
    tipoBug: str(campos.tipoBug),
    dono: donoNome,
  };
}

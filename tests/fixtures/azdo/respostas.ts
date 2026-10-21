/** Simulated Azure DevOps responses (the cloud session cannot reach dev.azure.com). */
import type { FetchLike } from '../../../src/ponte/azure/client.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

export const AGORA = new Date('2026-10-21T12:00:00Z');
const dias = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString();

export function wi(id: number, f: Record<string, unknown>) {
  return {
    id,
    fields: {
      'System.WorkItemType': 'Task', 'System.State': 'Active', 'System.BoardColumn': 'Dev implementando', 'System.Title': `Item ${id}`,
      'System.AreaPath': 'Metanet\\Squad Fiscal', 'System.IterationPath': 'Metanet\\Sprint 42',
      'System.CreatedDate': dias(20), 'System.ChangedDate': dias(1), 'System.StateChangeDate': dias(1),
      'System.AssignedTo': { uniqueName: 'ana@empresa.com' }, 'Microsoft.VSTS.Scheduling.StoryPoints': 3,
      ...f,
    },
  };
}

export const ITENS = [
  wi(1, { 'System.State': 'Active', 'System.StateChangeDate': dias(12), 'System.ChangedDate': dias(12) }), // envelhecendo
  wi(2, { 'System.State': 'Active', 'Custom.Status': 'Aguardando resposta do cliente', 'System.ChangedDate': dias(5) }), // paralisado (campo com texto)
  wi(3, { 'System.WorkItemType': 'User Story', 'System.State': 'Active', 'System.AssignedTo': undefined, 'Microsoft.VSTS.Scheduling.StoryPoints': undefined }), // em andamento, sem dono e sem estimativa
  wi(4, { 'System.State': 'Closed', 'System.BoardColumn': 'Concluído', 'System.CreatedDate': dias(10), 'Microsoft.VSTS.Common.ActivatedDate': dias(6), 'Microsoft.VSTS.Common.ClosedDate': dias(2), 'System.StateChangeDate': dias(2) }),
  wi(5, { 'System.State': 'Closed', 'System.BoardColumn': 'Concluído', 'System.WorkItemType': 'Bug', 'Custom.TipoBug': 'Bug Externo', 'System.CreatedDate': dias(8), 'Microsoft.VSTS.Common.ClosedDate': dias(6), 'System.StateChangeDate': dias(6) }),
  wi(6, { 'System.State': 'Active', 'System.WorkItemType': 'Bug', 'Custom.TipoBug': 'Bug Interno', 'Custom.Status': '', 'System.AssignedTo': undefined }), // bug interno sem dono
  wi(7, { 'System.State': 'Active', 'System.AssignedTo': { uniqueName: 'ana@empresa.com' } }),
  wi(8, { 'System.State': 'New', 'System.BoardColumn': 'Ideias', 'System.WorkItemType': 'Bug', 'Custom.TipoBug': 'Bug Interno', 'System.StateChangeDate': dias(60), 'System.ChangedDate': dias(60), 'System.AssignedTo': undefined, 'Microsoft.VSTS.Scheduling.StoryPoints': undefined }), // ideia: fora de toda métrica
];

/** Column history of the finished items: when each one entered "Fazendo Análise". */
export const REVISOES: Record<number, { col: string; estado?: string; dias: number }[]> = {
  4: [{ col: 'Ideias', dias: 12 }, { col: 'Backlog', dias: 10 }, { col: 'Fazendo Análise', dias: 9 }, { col: 'Dev implementando', estado: 'Active', dias: 6 }, { col: 'Concluído', estado: 'Closed', dias: 2 }],
  5: [{ col: 'Disponível para Dev', dias: 8 }, { col: 'Concluído', estado: 'Closed', dias: 6 }],
};

export const ITERACOES = {
  name: 'Metanet', children: [
    { name: 'Sprint 41', attributes: { startDate: dias(28), finishDate: dias(15) } },
    { name: 'Sprint 42', attributes: { startDate: dias(14), finishDate: dias(-1) } },
  ],
};

/** A fetch that answers the Azure DevOps routes used by the sync; `chamadas` records the paths. */
export function fakeFetch(chamadas: { url: string; body?: string; auth?: string }[] = [], opts: { status?: number } = {}): FetchLike {
  return async (url, init) => {
    chamadas.push({ url, body: init?.body as string | undefined, auth: (init?.headers as Record<string, string>)?.Authorization });
    if (opts.status) return json({ message: 'segredo' }, opts.status);
    if (url.includes('/wiql')) return json({ workItems: ITENS.map((i) => ({ id: i.id })) });
    if (url.includes('/workitemsbatch')) {
      const ids: number[] = JSON.parse(init!.body as string).ids;
      return json({ value: ITENS.filter((i) => ids.includes(i.id)) });
    }
    const rev = /\/workitems\/(\d+)\/revisions/.exec(url);
    if (rev) {
      return json({ value: (REVISOES[Number(rev[1])] ?? []).map((r) => ({ fields: { 'System.BoardColumn': r.col, 'System.State': r.estado ?? 'New', 'System.ChangedDate': dias(r.dias) } })) });
    }
    if (url.includes('/classificationnodes/iterations')) return json(ITERACOES);
    if (url.includes('/commits')) {
      return json({ value: [0, 1, 2, 9, 10].map((d, n) => ({ commitId: `c${n}`, committer: { date: dias(d) } })) });
    }
    if (url.includes('/pullrequests')) return json({ value: [{ pullRequestId: 7, status: 'completed', creationDate: dias(5), closedDate: dias(3) }] });
    return json({}, 404);
  };
}

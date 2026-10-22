import { acharTime, timesAtivos } from '../../src/ponte/azure/escopo.js';

describe('escopo dos times', () => {
  it('resolves a team by id, name or Azure DevOps area path', () => {
    for (const ref of ['fiscal', 'Squad Fiscal', 'squad  fiscal', 'Metanet\\Squad Fiscal', 'metanet/squad fiscal']) {
      expect(acharTime(ref)?.id).toBe('fiscal');
    }
    expect(acharTime('Squad Retaguarda WEB')?.id).toBe('retaguarda');
    expect(acharTime('inexistente')).toBeUndefined();
  });

  it('reads AZDO_TIMES with names, keeps the default and rejects unknown entries', () => {
    expect(timesAtivos({ AZDO_TIMES: 'Squad Fiscal, desktop' } as NodeJS.ProcessEnv).map((t) => t.id)).toEqual(['fiscal', 'desktop']);
    expect(timesAtivos({} as NodeJS.ProcessEnv).map((t) => t.id)).toEqual(['fiscal']);
    expect(() => timesAtivos({ AZDO_TIMES: 'Squad Xyz' } as NodeJS.ProcessEnv)).toThrow(/time desconhecido "Squad Xyz"/);
  });
});

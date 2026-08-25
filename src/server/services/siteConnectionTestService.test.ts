import { beforeEach, describe, expect, it, vi } from 'vitest';

const endpointRows = vi.hoisted(() => ({ value: [] as Array<Record<string, unknown>> }));
const routeRows = vi.hoisted(() => ({ value: [] as Array<Record<string, unknown>> }));
const groupSourceRows = vi.hoisted(() => ({ value: [] as Array<Record<string, unknown>> }));
const probeRuntimeModelMock = vi.hoisted(() => vi.fn());
const siteApiEndpointsTable = vi.hoisted(() => ({ name: 'siteApiEndpoints' }));
const tokenRoutesTable = vi.hoisted(() => ({ name: 'tokenRoutes' }));
const routeGroupSourcesTable = vi.hoisted(() => ({ name: 'routeGroupSources' }));

vi.mock('drizzle-orm', () => ({
  asc: (value: unknown) => value,
  eq: (left: unknown, right: unknown) => ({ left, right }),
  inArray: (left: unknown, right: unknown) => ({ left, right }),
}));

vi.mock('../db/index.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        const rows = table === siteApiEndpointsTable
          ? endpointRows.value
          : table === tokenRoutesTable
            ? routeRows.value
            : groupSourceRows.value;
        return {
          where: () => ({
            orderBy: () => ({
              all: async () => rows,
            }),
            all: async () => rows,
          }),
        };
      },
    }),
  },
  schema: {
    siteApiEndpoints: siteApiEndpointsTable,
    tokenRoutes: tokenRoutesTable,
    routeGroupSources: routeGroupSourcesTable,
    accounts: {},
  },
}));

vi.mock('./siteApiEndpointService.js', () => ({
  normalizeSiteApiEndpointBaseUrl: (value: string) => value.trim().replace(/\/+$/, ''),
}));

vi.mock('./runtimeModelProbe.js', () => ({
  probeRuntimeModel: (...args: unknown[]) => probeRuntimeModelMock(...args),
}));

describe('testSiteModelConnection', () => {
  beforeEach(() => {
    endpointRows.value = [
      { id: 12, siteId: 7, url: 'https://api.commandcode.ai/provider/', enabled: true, sortOrder: 0 },
      { id: 13, siteId: 7, url: 'https://backup.example/provider', enabled: false, sortOrder: 1 },
    ];
    routeRows.value = [];
    groupSourceRows.value = [];
    probeRuntimeModelMock.mockReset();
    probeRuntimeModelMock.mockResolvedValue({
      status: 'inconclusive',
      latencyMs: 250,
      reason: 'Invalid input',
      path: '/v1/messages',
      statusCode: 400,
    });
  });

  it('tests each configured endpoint and keeps disabled endpoints visible without probing them', async () => {
    const { testSiteModelConnection } = await import('./siteConnectionTestService.js');
    const result = await testSiteModelConnection({
      site: { id: 7, url: 'https://panel.example', platform: 'claude' } as any,
      token: 'sk-secret',
      modelName: 'deepseek/deepseek-v4-flash',
    });

    expect(result.success).toBe(false);
    expect(result.tests).toHaveLength(2);
    expect(result.tests[0]).toMatchObject({
      endpointId: 12,
      endpointUrl: 'https://api.commandcode.ai/provider',
      path: '/v1/messages',
      statusCode: 400,
      message: 'Invalid input',
    });
    expect(result.tests[1]).toMatchObject({
      endpointId: 13,
      enabled: false,
      status: 'skipped',
    });
    expect(probeRuntimeModelMock).toHaveBeenCalledTimes(1);
    expect(probeRuntimeModelMock.mock.calls[0]?.[0]).toMatchObject({
      modelName: 'deepseek/deepseek-v4-flash',
      targetBaseUrl: 'https://api.commandcode.ai/provider',
      tokenValue: 'sk-secret',
    });
  });

  it('resolves a local explicit-group alias to its unique upstream source model', async () => {
    const { resolveTestModelNameFromRoutes } = await import('./siteConnectionTestService.js');
    const result = resolveTestModelNameFromRoutes({
      requestedModel: 'deepseek-v4-flash',
      routes: [
        {
          id: 10,
          modelPattern: 'deepseek-v4-flash',
          displayName: 'deepseek-v4-flash',
          routeMode: 'explicit_group',
          modelMapping: null,
          enabled: true,
        },
        {
          id: 11,
          modelPattern: 'deepseek/deepseek-v4-flash',
          displayName: null,
          routeMode: 'pattern',
          modelMapping: null,
          enabled: true,
        },
      ],
      groupSources: [{ groupRouteId: 10, sourceRouteId: 11 }],
    });

    expect(result).toEqual({
      requestedModelName: 'deepseek-v4-flash',
      actualModelName: 'deepseek/deepseek-v4-flash',
      resolved: true,
    });
  });

  it('passes the resolved source model to the runtime probe when testing a local alias', async () => {
    routeRows.value = [
      {
        id: 10,
        modelPattern: 'deepseek-v4-flash',
        displayName: 'deepseek-v4-flash',
        routeMode: 'explicit_group',
        modelMapping: null,
        enabled: true,
      },
      {
        id: 11,
        modelPattern: 'deepseek/deepseek-v4-flash',
        displayName: null,
        routeMode: 'pattern',
        modelMapping: null,
        enabled: true,
      },
    ];
    groupSourceRows.value = [{ groupRouteId: 10, sourceRouteId: 11 }];

    const { testSiteModelConnection } = await import('./siteConnectionTestService.js');
    await testSiteModelConnection({
      site: { id: 7, url: 'https://panel.example', platform: 'claude' } as any,
      token: 'sk-secret',
      modelName: 'deepseek-v4-flash',
    });

    expect(probeRuntimeModelMock.mock.calls[0]?.[0]).toMatchObject({
      modelName: 'deepseek/deepseek-v4-flash',
    });
  });

  it('keeps an ambiguous alias unchanged instead of guessing a provider prefix', async () => {
    const { resolveTestModelNameFromRoutes } = await import('./siteConnectionTestService.js');
    const result = resolveTestModelNameFromRoutes({
      requestedModel: 'deepseek-v4-flash',
      routes: [
        { id: 10, modelPattern: 'deepseek-v4-flash', displayName: 'deepseek-v4-flash', routeMode: 'explicit_group', modelMapping: null, enabled: true },
        { id: 11, modelPattern: 'provider-a/deepseek-v4-flash', displayName: null, routeMode: 'pattern', modelMapping: null, enabled: true },
        { id: 12, modelPattern: 'provider-b/deepseek-v4-flash', displayName: null, routeMode: 'pattern', modelMapping: null, enabled: true },
      ],
      groupSources: [
        { groupRouteId: 10, sourceRouteId: 11 },
        { groupRouteId: 10, sourceRouteId: 12 },
      ],
    });

    expect(result).toEqual({
      requestedModelName: 'deepseek-v4-flash',
      actualModelName: 'deepseek-v4-flash',
      resolved: false,
    });
  });
});

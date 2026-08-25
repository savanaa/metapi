import { asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { normalizeSiteApiEndpointBaseUrl } from './siteApiEndpointService.js';
import { probeRuntimeModel, type RuntimeModelProbeResult } from './runtimeModelProbe.js';

export type SiteModelConnectionTest = {
  endpointId: number | null;
  endpointUrl: string;
  enabled: boolean;
  success: boolean;
  status: RuntimeModelProbeResult['status'] | 'skipped';
  latencyMs: number | null;
  path: string | null;
  statusCode: number | null;
  message: string;
};

type TestModelRoute = {
  id: number;
  modelPattern: string;
  displayName: string | null;
  routeMode: string | null;
  modelMapping: string | null;
  enabled: boolean | null;
};

type TestModelGroupSource = {
  groupRouteId: number;
  sourceRouteId: number;
};

type TestModelResolution = {
  requestedModelName: string;
  actualModelName: string;
  resolved: boolean;
};

function parseTestModelMapping(value: string | null): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, target]) => typeof target === 'string' && target.trim().length > 0)
        .map(([pattern, target]) => [pattern, (target as string).trim()]),
    );
  } catch {
    return {};
  }
}

function isExplicitTestModelGroup(route: TestModelRoute): boolean {
  return route.routeMode === 'explicit_group';
}

/**
 * Resolve only mappings that are unambiguous in the stored route definition.
 * A provider prefix is provider-specific, so guessing one from a bare alias
 * would make the connection test report a false positive or hit the wrong model.
 */
export function resolveTestModelNameFromRoutes(input: {
  requestedModel: string;
  routes: TestModelRoute[];
  groupSources: TestModelGroupSource[];
}): TestModelResolution {
  const requestedModelName = input.requestedModel.trim();
  const routesById = new Map(input.routes.map((route) => [route.id, route]));
  const sourceIdsByGroupId = new Map<number, number[]>();
  for (const source of input.groupSources) {
    const sourceIds = sourceIdsByGroupId.get(source.groupRouteId) || [];
    sourceIds.push(source.sourceRouteId);
    sourceIdsByGroupId.set(source.groupRouteId, sourceIds);
  }

  const candidates = new Set<string>();
  for (const route of input.routes) {
    if (route.enabled === false) continue;
    const routeName = route.displayName?.trim() || route.modelPattern.trim();
    if (routeName !== requestedModelName) continue;

    if (isExplicitTestModelGroup(route)) {
      for (const sourceRouteId of sourceIdsByGroupId.get(route.id) || []) {
        const sourceRoute = routesById.get(sourceRouteId);
        if (sourceRoute?.enabled !== false && sourceRoute?.modelPattern.trim()) {
          candidates.add(sourceRoute.modelPattern.trim());
        }
      }
      continue;
    }

    const mappedModel = parseTestModelMapping(route.modelMapping)[requestedModelName];
    if (mappedModel) candidates.add(mappedModel);
  }

  if (candidates.size !== 1) {
    return {
      requestedModelName,
      actualModelName: requestedModelName,
      resolved: false,
    };
  }

  const actualModelName = Array.from(candidates)[0] || requestedModelName;
  return {
    requestedModelName,
    actualModelName,
    resolved: actualModelName !== requestedModelName,
  };
}

async function resolveTestModelName(requestedModel: string): Promise<TestModelResolution> {
  const normalizedModel = requestedModel.trim();
  if (!normalizedModel || normalizedModel.includes('/')) {
    return {
      requestedModelName: normalizedModel,
      actualModelName: normalizedModel,
      resolved: false,
    };
  }

  const routes = await db.select({
    id: schema.tokenRoutes.id,
    modelPattern: schema.tokenRoutes.modelPattern,
    displayName: schema.tokenRoutes.displayName,
    routeMode: schema.tokenRoutes.routeMode,
    modelMapping: schema.tokenRoutes.modelMapping,
    enabled: schema.tokenRoutes.enabled,
  }).from(schema.tokenRoutes)
    .where(eq(schema.tokenRoutes.enabled, true))
    .all();
  const groupRouteIds = routes
    .filter((route) => route.routeMode === 'explicit_group')
    .map((route) => route.id);
  const groupSources = groupRouteIds.length > 0
    ? await db.select({
      groupRouteId: schema.routeGroupSources.groupRouteId,
      sourceRouteId: schema.routeGroupSources.sourceRouteId,
    }).from(schema.routeGroupSources)
      .where(inArray(schema.routeGroupSources.groupRouteId, groupRouteIds))
      .all()
    : [];

  return resolveTestModelNameFromRoutes({
    requestedModel: normalizedModel,
    routes,
    groupSources,
  });
}

function redactSecret(value: string, secret: string): string {
  const trimmedSecret = secret.trim();
  if (!trimmedSecret) return value;
  return value.split(trimmedSecret).join('<REDACTED>');
}

function normalizeDiagnosticMessage(value: unknown, token: string): string {
  const message = String(value || '').trim();
  if (!message) return '模型请求失败';
  return redactSecret(message.slice(0, 2000), token);
}

function buildDiagnosticAccount(
  siteId: number,
  token: string,
): typeof schema.accounts.$inferSelect {
  return {
    id: 0,
    siteId,
    username: 'connection-test',
    password: null,
    accessToken: '',
    apiToken: token,
    balance: 0,
    usedQuota: 0,
    status: 'active',
    checkinEnabled: false,
    lastCheckinAt: null,
    lastCheckinStatus: null,
    lastCheckinMessage: null,
    lastBalanceRefreshAt: null,
    extraConfig: null,
    oauthProvider: null,
    oauthToken: null,
    oauthRefreshToken: null,
    oauthExpiresAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as typeof schema.accounts.$inferSelect;
}

export async function testSiteModelConnection(input: {
  site: typeof schema.sites.$inferSelect;
  token: string;
  modelName: string;
  endpointId?: number;
  timeoutMs?: number;
}): Promise<{
  success: boolean;
  modelName: string;
  actualModelName: string;
  tests: SiteModelConnectionTest[];
}> {
  const modelResolution = await resolveTestModelName(input.modelName);
  const endpointRows = await db.select()
    .from(schema.siteApiEndpoints)
    .where(eq(schema.siteApiEndpoints.siteId, input.site.id))
    .orderBy(asc(schema.siteApiEndpoints.sortOrder), asc(schema.siteApiEndpoints.id))
    .all();

  const selectedRows = input.endpointId
    ? endpointRows.filter((row) => row.id === input.endpointId)
    : endpointRows;
  const targets = selectedRows.length > 0
    ? selectedRows.map((row) => ({
      endpointId: row.id,
      endpointUrl: normalizeSiteApiEndpointBaseUrl(row.url),
      enabled: row.enabled !== false,
    }))
    : endpointRows.length > 0
      ? []
      : [{
        endpointId: null,
        endpointUrl: normalizeSiteApiEndpointBaseUrl(input.site.url),
        enabled: true,
      }];

  const account = buildDiagnosticAccount(input.site.id, input.token);
  const tests: SiteModelConnectionTest[] = [];
  for (const target of targets) {
    if (!target.enabled) {
      tests.push({
        endpointId: target.endpointId,
        endpointUrl: target.endpointUrl,
        enabled: false,
        success: false,
        status: 'skipped',
        latencyMs: null,
        path: null,
        statusCode: null,
        message: 'API 地址已禁用，未发送请求',
      });
      continue;
    }

    const result = await probeRuntimeModel({
      site: input.site,
      account,
      modelName: modelResolution.actualModelName,
      timeoutMs: input.timeoutMs ?? 15_000,
      tokenValue: input.token,
      targetBaseUrl: target.endpointUrl,
    });
    tests.push({
      endpointId: target.endpointId,
      endpointUrl: target.endpointUrl,
      enabled: true,
      success: result.status === 'supported',
      status: result.status,
      latencyMs: result.latencyMs,
      path: result.path || null,
      statusCode: result.statusCode ?? null,
      message: result.status === 'supported'
        ? '模型请求成功'
        : normalizeDiagnosticMessage(result.reason, input.token),
    });
  }

  return {
    success: tests.some((test) => test.success),
    modelName: input.modelName,
    actualModelName: modelResolution.actualModelName,
    tests,
  };
}

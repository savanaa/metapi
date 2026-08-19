import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import CacheHitRateChart from './CacheHitRateChart.js';

vi.mock('@visactor/react-vchart', () => ({
  VChart: () => null,
}));

describe('CacheHitRateChart', () => {
  const originalDocument = globalThis.document;
  const originalGetComputedStyle = globalThis.getComputedStyle;
  const originalMutationObserver = globalThis.MutationObserver;

  beforeEach(() => {
    globalThis.document = {
      documentElement: {
        getAttribute: vi.fn(),
      },
    } as unknown as Document;
    Reflect.deleteProperty(globalThis as typeof globalThis & Record<string, unknown>, 'getComputedStyle');
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    (globalThis as typeof globalThis & Record<string, unknown>).getComputedStyle = originalGetComputedStyle;
    (globalThis as typeof globalThis & Record<string, unknown>).MutationObserver = originalMutationObserver;
    vi.restoreAllMocks();
  });

  function toJson(node: React.ReactElement) {
    return create(node).toJSON();
  }

  it('renders no-data placeholder when cacheStats is missing', () => {
    const tree = toJson(<CacheHitRateChart cacheStats={null} />) as any;
    const text = JSON.stringify(tree);
    expect(text).toContain('暂无缓存数据');
  });

  it('renders global ratio and site chips from cacheStats', async () => {
    const tree = await act(async () =>
      create(
        <CacheHitRateChart
          cacheStats={{
            totalCachedTokens: 1200,
            cacheDataCalls: 100,
            cacheHitCalls: 30,
            bySite: [
              {
                siteId: 1,
                siteName: 'SiteA',
                totalCachedTokens: 1200,
                cacheDataCalls: 100,
                cacheHitCalls: 30,
                hourly: [
                  {
                    hourStartUtc: '2026-03-10T10:00:00.000Z',
                    totalCachedTokens: 1200,
                    cacheDataCalls: 100,
                    cacheHitCalls: 30,
                  },
                ],
              },
            ],
          }}
        />,
      ),
    ) as any;
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('SiteA');
    expect(text).toContain('1,200');
  });

  it('shows no-chart placeholder when the selected site has no cache-data requests', async () => {
    const tree = await act(async () =>
      create(
        <CacheHitRateChart
          cacheStats={{
            totalCachedTokens: 0,
            cacheDataCalls: 0,
            cacheHitCalls: 0,
            bySite: [
              {
                siteId: 2,
                siteName: 'SiteB',
                totalCachedTokens: 0,
                cacheDataCalls: 0,
                cacheHitCalls: 0,
                hourly: [
                  {
                    hourStartUtc: '2026-03-10T10:00:00.000Z',
                    totalCachedTokens: 0,
                    cacheDataCalls: 0,
                    cacheHitCalls: 0,
                  },
                ],
              },
            ],
          }}
        />,
      ),
    ) as any;
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('SiteB');
    expect(text).toContain('所选站点暂无有缓存数据的请求');
  });
});

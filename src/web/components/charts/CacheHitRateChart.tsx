import React, { useMemo, useState } from 'react';
import { VChart } from '@visactor/react-vchart';

interface CacheHourPoint {
  hourStartUtc: string;
  totalCachedTokens: number;
  cacheDataCalls: number;
  cacheHitCalls: number;
  totalCalls: number;
}

interface CacheSiteStat {
  siteId: number;
  siteName: string;
  totalCachedTokens: number;
  cacheDataCalls: number;
  cacheHitCalls: number;
  totalCalls: number;
  hourly: CacheHourPoint[];
}

interface CacheHitRateChartProps {
  cacheStats?: {
    totalCachedTokens: number;
    cacheDataCalls: number;
    cacheHitCalls: number;
    totalCalls: number;
    bySite: CacheSiteStat[];
  } | null;
  loading?: boolean;
}

const COLOR_PALETTE = [
  '#4f46e5',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
];

function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '--';
  return `${(ratio * 100).toFixed(1)}%`;
}

export default function CacheHitRateChart({ cacheStats, loading }: CacheHitRateChartProps) {
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);

  const globalRatio = cacheStats && cacheStats.cacheDataCalls > 0
    ? cacheStats.cacheHitCalls / cacheStats.cacheDataCalls
    : null;

  const selectedSite = useMemo(() => {
    if (!cacheStats) return null;
    const target = selectedSiteId == null
      ? null
      : cacheStats.bySite.find((site) => site.siteId === selectedSiteId);
    return target || cacheStats.bySite[0] || null;
  }, [cacheStats, selectedSiteId]);

  const chartData = useMemo(() => {
    if (!selectedSite) return [];
    return selectedSite.hourly
      .filter((point) => point.cacheDataCalls > 0)
      .map((point) => ({
        time: point.hourStartUtc.slice(5, 16),
        rate: point.cacheDataCalls > 0
          ? Number(((point.cacheHitCalls / point.cacheDataCalls) * 100).toFixed(1))
          : 0,
      }));
  }, [selectedSite]);

  if (loading && !cacheStats) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: 13, padding: '16px 0' }}>加载中…</div>;
  }

  if (!cacheStats) {
    return (
      <div style={{ color: 'var(--color-text-muted)', fontSize: 13, padding: '16px 0' }}>
        暂无缓存数据
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>请求命中率</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {globalRatio == null ? '--' : formatPercent(globalRatio)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>缓存命中 Tokens</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {cacheStats.totalCachedTokens.toLocaleString()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>有数据请求</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {cacheStats.cacheDataCalls.toLocaleString()}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            color: 'var(--color-text-muted)',
            fontSize: 12,
          }}
        >
          <div>
            数据覆盖{' '}
            {cacheStats.totalCalls > 0
              ? `${((cacheStats.cacheDataCalls / cacheStats.totalCalls) * 100).toFixed(1)}%`
              : '--'}
          </div>
          <div>
            {cacheStats.cacheDataCalls.toLocaleString()} / {cacheStats.totalCalls.toLocaleString()}{' '}
            请求,无数据 {Math.max(0, cacheStats.totalCalls - cacheStats.cacheDataCalls).toLocaleString()}
          </div>
        </div>
      </div>

      {cacheStats.bySite.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {cacheStats.bySite.map((site, index) => {
              const ratio = site.cacheDataCalls > 0
                ? site.cacheHitCalls / site.cacheDataCalls
                : null;
              const selected = selectedSite?.siteId === site.siteId;
              return (
                <button
                  key={site.siteId}
                  onClick={() => setSelectedSiteId(site.siteId)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: `1px solid ${selected ? COLOR_PALETTE[index % COLOR_PALETTE.length] : 'var(--color-border)'}`,
                    background: selected ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: COLOR_PALETTE[index % COLOR_PALETTE.length],
                    }}
                  />
                  {site.siteName}
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {ratio == null ? '--' : formatPercent(ratio)}
                  </span>
                </button>
              );
            })}
          </div>

          {chartData.length > 0 ? (
            <VChart
              spec={{
                type: 'line',
                data: { values: chartData },
                xField: 'time',
                yField: 'rate',
                title: { visible: false },
                axes: [
                  { orient: 'left', title: { visible: true, text: '命中率 %' } },
                  { orient: 'bottom', title: { visible: false } },
                ],
                line: { style: { stroke: '#10b981', lineWidth: 2 } },
                point: { visible: true, style: { fill: '#10b981' } },
                tooltip: {
                  visible: true,
                  mark: {
                    title: {
                      value: (datum: any) => String(datum?.time ?? ""),
                    },
                  },
                },
              }}
              style={{ height: 220 }}
            />
          ) : (
            <div style={{ color: 'var(--color-text-muted)', fontSize: 13, padding: '12px 0' }}>
              所选站点暂无有缓存数据的请求
            </div>
          )}
        </div>
      )}
    </div>
  );
}

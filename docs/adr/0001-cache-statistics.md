# 缓存统计:独立列、聚合原始量、双命中率口径

为支持按缓存维度排序/筛选/趋势聚合,决定把缓存用量从 `billing_details` JSON 提升为 `proxy_logs` 独立列(`cached_tokens`、`cache_write_tokens`、`prompt_tokens_include_cache`),聚合表(`site_hour_usage`/`site_day_usage`/`model_day_usage`)同步加列,并新增 `cache_data_calls`、`cache_hit_calls` 两个原始量作为请求命中率的分母/分子。聚合层只持久化原始量,两个派生指标(缓存输入占比、缓存请求命中率)由前端/查询时计算,避免锁死口径。缓存输入占比必须处理 `prompt_tokens_include_cache` 语义,避免 include=true 时重复计数。

## 三态显示口径

缓存状态在界面上区分三种,不能只显示 0:`已命中`(上游返回缓存字段且命中>0)、`未命中`(上游返回缓存字段但命中=0)、`无数据`(上游未返回任何缓存字段,`prompt_tokens_include_cache` 为 null)。判定用请求级信号,不做站点级能力探测——中转站返回行为不稳定,请求级事实最可靠。聚合口径:缓存请求命中率 = cache_hit_calls ÷ cache_data_calls,分母只含有数据请求,并在卡片标注数据覆盖率,避免把"无数据"混入分母制造假象。

## 多站点异构容错

上游返回的 usage 字段五花八门,甚至可能完全不返回。解析层统一走 `proxyUsageParser`,所有缺失/非法值一律安全归零,不抛异常;缓存字段缺失时计费退化为普通输入计费(不享受缓存折扣),日志照记。缓存统计是纯增量,上游给了就多记一笔,不给就记 0,绝不影响路由、转发、计费、日志等正常功能。

# MetAPI Context

MetAPI 是一个 LLM API 中转/代理服务:把下游客户端(Codex、Claude Code 等)的请求路由到上游站点/账号,并统一做日志、计费与统计。本上下文描述代理链路与用量统计的核心语言。

## Language

**代理请求 (Proxy Request)**:
下游客户端发往 MetAPI 的一次 API 调用,经路由选择后转达上游。
_Avoid_: 调用、请求记录

**路由 (Route)**:
一个模型到若干通道(channel)的映射,决定某模型可走哪些上游。
_Avoid_: 规则、线路

**通道 (Channel)**:
某个账号在一个站点上的一条可用连接,是代理请求实际发出的出口。
_Avoid_: 节点、出口

**站点 (Site)**:
上游提供商(如 OpenAI、Claude、TeamoRouter),拥有若干账号。
_Avoid_: 供应商、平台

**账号 (Account)**:
站点下的一个凭证主体,可持有 API Key 或会话令牌。
_Avoid_: 用户、令牌主体

**下游 (Downstream)**:
发请求给 MetAPI 的客户端及其 API Key;下游策略可限制可用路由。
_Avoid_: 客户端侧

**用量 (Usage)**:
一次代理请求的 token 消耗明细,通常来自上游返回的 usage 字段。

**输入 Token (Prompt Tokens)**:
请求侧消耗的 token 总量,来自上游 usage 的 prompt/completion 拆分。
_Avoid_: 输入、上下文 token

**输出 Token (Completion Tokens)**:
响应侧生成的 token 量。

**缓存命中 Token (Cache Read Tokens)**:
本次请求从上游提示词缓存中命中的输入 token 数。
_Avoid_: 缓存命中数、cached

**缓存写入 Token (Cache Write Tokens)**:
本次请求首次写入上游提示词缓存的 token 数。
_Avoid_: 缓存创建、cache creation

**缓存输入占比 (Cache Input Ratio)**:
token 口径指标 = 缓存命中 Token ÷ 该请求全部输入 Token。用于衡量成本与效率。
_Avoid_: 缓存命中率(token 口径)

**缓存请求命中率 (Cache Request Hit Ratio)**:
请求口径指标 = 缓存命中 Token > 0 的请求数 ÷ 成功请求数。用于衡量缓存有效性。
_Avoid_: 缓存命中率(请求口径)

**缓存语义标记 (Prompt Tokens Include Cache)**:
布尔标记,表示上游返回的输入 Token 是否已包含缓存命中部分;为真时计算占比需先扣除缓存命中,避免重复计数。三值:true(OpenAI 风格)、false(Anthropic 风格)、null(上游未返回任何缓存字段)。
_Avoid_: include 标志、缓存已含

**已命中 (Cache Hit)**:
一次代理请求的缓存状态之一:上游返回了缓存字段,且缓存命中 Token > 0。
_Avoid_: 命中、有缓存

**未命中 (Cache Miss)**:
缓存状态之一:上游返回了缓存字段,但缓存命中 Token = 0。表示站点支持缓存,但本次请求未命中。
_Avoid_: 0、无命中

**无数据 (No Cache Data)**:
缓存状态之一:上游未返回任何缓存字段(缓存语义标记为 null)。不能断言站点不支持缓存,只能说本次请求未取得缓存数据。
_Avoid_: 不支持、N/A、无缓存

**有缓存数据请求数 (Cache Data Calls)**:
成功请求中缓存语义标记非 null 的请求数,是缓存请求命中率的分母。
_Avoid_: 有效请求数、可用请求数

**缓存命中请求数 (Cache Hit Calls)**:
成功请求中缓存命中 Token > 0 的请求数,是缓存请求命中率的分子。
_Avoid_: 命中请求数、命中次数

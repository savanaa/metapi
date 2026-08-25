type AnthropicPayload = Record<string, unknown>;

function isRecord(value: unknown): value is AnthropicPayload {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item)) as T;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]),
    ) as T;
  }
  return value;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asTrimmedString(value: unknown): string {
  return asString(value).trim();
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' || value === null ? value : null;
}

function asNonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : fallback;
}

function normalizeToolInput(value: unknown): AnthropicPayload {
  if (isRecord(value)) return cloneJsonValue(value);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (isRecord(parsed)) return parsed;
    } catch {
      // Keep the protocol shape valid when an upstream emits malformed JSON.
    }
  }
  return {};
}

function buildFallbackId(prefix: string, index: number): string {
  return `${prefix}_${index}`;
}

export function normalizeAnthropicContentBlock(
  value: unknown,
  index = 0,
): AnthropicPayload {
  const source = isRecord(value) ? cloneJsonValue(value) : {};
  const type = asTrimmedString(source.type).toLowerCase();

  if (type === 'text') {
    return { ...source, type: 'text', text: asString(source.text) };
  }

  if (type === 'thinking') {
    const normalized: AnthropicPayload = {
      ...source,
      type: 'thinking',
      thinking: asString(source.thinking),
    };
    if (typeof source.signature !== 'string') delete normalized.signature;
    return normalized;
  }

  if (type === 'redacted_thinking') {
    return { ...source, type: 'redacted_thinking', data: asString(source.data) };
  }

  if (type === 'tool_use') {
    return {
      ...source,
      type: 'tool_use',
      id: asTrimmedString(source.id) || buildFallbackId('toolu', index),
      name: asTrimmedString(source.name) || buildFallbackId('tool', index),
      input: normalizeToolInput(source.input),
    };
  }

  if (type === 'server_tool_use') {
    return {
      ...source,
      type: 'server_tool_use',
      id: asTrimmedString(source.id) || buildFallbackId('srvtoolu', index),
      name: asTrimmedString(source.name) || buildFallbackId('server_tool', index),
      input: normalizeToolInput(source.input),
    };
  }

  // Preserve known and future Anthropic block types without rewriting their
  // provider-specific fields. Only repair the discriminator when it is absent.
  if (type) return { ...source, type };

  return {
    type: 'text',
    text: asString(source.text),
  };
}

function normalizeMessageStart(
  payload: AnthropicPayload,
  fallbackModel: string,
  fallbackId: string,
): AnthropicPayload {
  const source = isRecord(payload.message) ? payload.message : {};
  const usage = isRecord(source.usage) ? source.usage : {};
  const content = Array.isArray(source.content)
    ? source.content.map((block, index) => normalizeAnthropicContentBlock(block, index))
    : [];
  const messageId = asTrimmedString(source.id) || `msg_${fallbackId.replace(/[^A-Za-z0-9_-]/g, '_')}`;

  return {
    ...payload,
    type: 'message_start',
    message: {
      ...source,
      id: messageId,
      type: 'message',
      role: 'assistant',
      model: asTrimmedString(source.model) || fallbackModel,
      content,
      stop_reason: asNullableString(source.stop_reason),
      stop_sequence: asNullableString(source.stop_sequence),
      usage: {
        ...usage,
        input_tokens: asNonNegativeInteger(usage.input_tokens, 0),
        output_tokens: asNonNegativeInteger(usage.output_tokens, 0),
      },
    },
  };
}

function normalizeContentBlockDelta(payload: AnthropicPayload): AnthropicPayload {
  const source = isRecord(payload.delta) ? payload.delta : {};
  const type = asTrimmedString(source.type).toLowerCase();

  if (type === 'text_delta') {
    return { ...payload, type: 'content_block_delta', delta: { ...source, type: 'text_delta', text: asString(source.text) } };
  }
  if (type === 'thinking_delta') {
    return { ...payload, type: 'content_block_delta', delta: { ...source, type: 'thinking_delta', thinking: asString(source.thinking) } };
  }
  if (type === 'input_json_delta') {
    return { ...payload, type: 'content_block_delta', delta: { ...source, type: 'input_json_delta', partial_json: asString(source.partial_json) } };
  }
  if (type === 'signature_delta') {
    return { ...payload, type: 'content_block_delta', delta: { ...source, type: 'signature_delta', signature: asString(source.signature) } };
  }
  if (type) return { ...payload, type: 'content_block_delta', delta: { ...source, type } };

  return {
    ...payload,
    type: 'content_block_delta',
    delta: { type: 'text_delta', text: '' },
  };
}

export function normalizeAnthropicOutboundSsePayload(
  eventName: string,
  value: unknown,
  fallbackModel: string,
  fallbackId: string,
): AnthropicPayload {
  const payload = isRecord(value) ? cloneJsonValue(value) : {};

  if (eventName === 'message_start') {
    return normalizeMessageStart(payload, fallbackModel, fallbackId);
  }

  if (eventName === 'content_block_start') {
    const contentBlock = normalizeAnthropicContentBlock(
      payload.content_block,
      asNonNegativeInteger(payload.index, 0),
    );
    if (contentBlock.type === 'tool_use') {
      contentBlock.input = {};
    }
    return {
      ...payload,
      type: 'content_block_start',
      index: asNonNegativeInteger(payload.index, 0),
      content_block: contentBlock,
    };
  }

  if (eventName === 'content_block_delta') {
    return {
      ...normalizeContentBlockDelta(payload),
      index: asNonNegativeInteger(payload.index, 0),
    };
  }

  if (eventName === 'content_block_stop') {
    return {
      ...payload,
      type: 'content_block_stop',
      index: asNonNegativeInteger(payload.index, 0),
    };
  }

  if (eventName === 'message_delta') {
    const source = isRecord(payload.delta) ? payload.delta : {};
    const usage = isRecord(payload.usage) ? payload.usage : {};
    return {
      ...payload,
      type: 'message_delta',
      delta: {
        ...source,
        stop_reason: asNullableString(source.stop_reason ?? payload.stop_reason),
        stop_sequence: asNullableString(source.stop_sequence ?? payload.stop_sequence),
      },
      usage: {
        ...usage,
        output_tokens: asNonNegativeInteger(usage.output_tokens, 0),
      },
    };
  }

  if (eventName === 'message_stop' || eventName === 'ping') {
    return { ...payload, type: eventName };
  }

  if (eventName === 'error') {
    return {
      ...payload,
      type: 'error',
      error: isRecord(payload.error)
        ? payload.error
        : { type: 'api_error', message: 'Upstream returned an invalid Anthropic error payload.' },
    };
  }

  return { ...payload, type: eventName };
}

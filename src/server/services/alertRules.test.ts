import { describe, expect, it } from 'vitest';
import { appendSessionTokenRebindHint, isCloudflareChallenge, isTokenExpiredError } from './alertRules.js';

describe('alertRules', () => {
  it('detects cloudflare challenge messages', () => {
    expect(isCloudflareChallenge('Cloudflare challenge detected')).toBe(true);
    expect(isCloudflareChallenge('cf challenge required')).toBe(true);
    expect(isCloudflareChallenge('invalid token')).toBe(false);
  });

  it('detects token expiration by status or message', () => {
    expect(isTokenExpiredError({ status: 401, message: 'Unauthorized' })).toBe(true);
    expect(isTokenExpiredError({ status: 403, message: 'Forbidden' })).toBe(false);
    expect(isTokenExpiredError({ message: 'HTTP 401: access token required' })).toBe(true);
    expect(isTokenExpiredError({ message: 'jwt expired' })).toBe(true);
    expect(isTokenExpiredError({ message: 'token invalid' })).toBe(true);
    expect(isTokenExpiredError({ message: 'invalid access token' })).toBe(true);
    expect(isTokenExpiredError({ message: 'Token 无效' })).toBe(true);
    expect(isTokenExpiredError({ message: '无权进行此操作，未登录且未提供 access token' })).toBe(false);
    expect(isTokenExpiredError({ status: 500, message: 'upstream error' })).toBe(false);
  });

  it('does not treat endpoint dispatch denial as token expiration', () => {
    expect(isTokenExpiredError({
      status: 403,
      message: 'This group does not allow /v1/messages dispatch',
    })).toBe(false);
    expect(isTokenExpiredError({
      status: 403,
      message: 'dispatch denied for /v1/responses',
    })).toBe(false);
    expect(isTokenExpiredError({
      message: 'unauthorized',
    })).toBe(false);
  });

  it('never treats HTTP 429 rate limits as token expiration even when the body echoes token/expired words', () => {
    const rateLimitedBody = [
      'Upstream returned HTTP 429: event: response.created data: {"type":"response.created"',
      '"instructions":"You are Claude Code... session tokens ... auto-expired after 7 days ..."',
      '"error":{"code":"rate_limit_exceeded","message":"Your requests to gpt-5.6-luna ... have exceeded rate limit."}',
    ].join(' ');
    expect(isTokenExpiredError({ status: 429, message: rateLimitedBody })).toBe(false);
    expect(isTokenExpiredError({ message: 'HTTP 429: too many requests' })).toBe(false);
    expect(isTokenExpiredError({ message: 'rate limit exceeded' })).toBe(false);
    expect(isTokenExpiredError({ message: 'quota exceeded' })).toBe(false);
  });

  it('appends rebind hint for invalid access token messages', () => {
    expect(appendSessionTokenRebindHint('无权进行此操作，access token 无效'))
      .toContain('请在中转站重新生成系统访问令牌后重新绑定账号');
    expect(appendSessionTokenRebindHint('invalid access token'))
      .toContain('请在中转站重新生成系统访问令牌后重新绑定账号');
  });

  it('does not append rebind hint for unrelated messages', () => {
    expect(appendSessionTokenRebindHint('network timeout')).toBe('network timeout');
  });
});

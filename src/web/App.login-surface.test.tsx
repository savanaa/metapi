import { describe, expect, it, vi } from 'vitest';
import { create, type ReactTestInstance } from 'react-test-renderer';
import { Login } from './App.js';
import { SITE_DOCS_URL, SITE_GITHUB_URL } from './docsLink.js';

function collectText(node: ReactTestInstance): string {
  return (node.children || []).map((child) => {
    if (typeof child === 'string') return child;
    return collectText(child);
  }).join('');
}

describe('Login surface', () => {
  it('uses the site root as the documentation URL', () => {
    expect(SITE_DOCS_URL).toBe('https://metapi.cita777.me');
  });

  it('uses the author github profile for the login github shortcut', () => {
    expect(SITE_GITHUB_URL).toBe('https://github.com/cita-777');
  });

  it('renders a focused brand description with an admin login panel', () => {
    const root = create(
      <Login onLogin={vi.fn()} t={(text) => text} />,
    );

    try {
      const pageText = collectText(root.root);
      const brandPanel = root.root.find((node) => (
        node.type === 'section'
        && typeof node.props.className === 'string'
        && node.props.className.includes('login-brand-panel')
      ));
      const authStage = root.root.find((node) => (
        node.type === 'section'
        && typeof node.props.className === 'string'
        && node.props.className.includes('login-auth-stage')
      ));
      const brandMarkCanvas = root.root.find((node) => (
        node.type === 'div'
        && typeof node.props.className === 'string'
        && node.props.className.includes('brand-mark-canvas')
      ));

      expect(pageText).toContain('Metapi');
      expect(pageText).toContain('中转站的中转站');
      expect(pageText).toContain('把分散的 New API / One API / OneHub 等站点聚合成统一网关，自动发现模型、智能路由、成本更优。');
      expect(pageText).not.toContain('兼容 New API / One API / OneHub / DoneHub / Veloera / AnyRouter / Sub2API');
      expect(pageText).not.toContain('智能路由引擎');
      expect(pageText).not.toContain('自动模型发现');
      expect(pageText).not.toContain('部署文档');
      expect(brandPanel).toBeTruthy();
      expect(authStage).toBeTruthy();
      expect(brandMarkCanvas).toBeTruthy();

      const tokenInput = root.root.find((node) => (
        node.type === 'input'
        && node.props.placeholder === '管理员令牌'
      ));

      expect(tokenInput.props.type).toBe('password');
    } finally {
      root?.unmount();
    }
  });
});

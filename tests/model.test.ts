import { describe, expect, it, vi } from 'vitest';
import { buildMessages, modelAdapter, serviceConfig, validateRequest } from '../server/model';
import { createApp } from '../server/app';
import type { GenerationRequest } from '../shared/contracts';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';

const request: GenerationRequest = { operation: 'rewrite', versionId: 'parent-version', title: '雨停之前', intent: '让她活下来', mode: 'minimal',
  context: { before: '她走到了渡口。', selected: '栈桥断开了。', after: '她没有回来。', background: '', genres: [] } };
const environment = { LLM_BASE_URL: 'http://127.0.0.1:12345/v1', LLM_MODEL: 'fixture-model', LLM_API_KEY: 'private-fixture-key' };
describe('模型适配与本地 API', () => {
  it('通过实际 HTTP 链路调用兼容接口并返回 live 正文，密钥不返回给浏览器', async () => {
    let auth: string | undefined, payload = '';
    const provider = createServer(async (req, res) => {
      auth = req.headers.authorization;
      for await (const chunk of req) payload += chunk.toString();
      expect(req.url).toBe('/v1/chat/completions');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: '那一步', text: '她抓住了救生绳。' }) } }] }));
    });
    provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
    const app = createApp({ ...environment, LLM_BASE_URL: 'http://127.0.0.1:' + (provider.address() as AddressInfo).port + '/v1' });
    app.listen(0, '127.0.0.1'); await once(app, 'listening');
    try {
      const response = await fetch('http://127.0.0.1:' + (app.address() as AddressInfo).port + '/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
      });
      const result = await response.json();
      expect(result).toMatchObject({ mode: 'live', title: '那一步', text: '她抓住了救生绳。' });
      expect(auth).toBe('Bearer private-fixture-key');
      expect(JSON.parse(payload).messages[1].content).toContain('让她活下来');
      expect(JSON.stringify(result)).not.toContain('private-fixture-key');
    } finally {
      await new Promise<void>(resolve => app.close(() => resolve()));
      await new Promise<void>(resolve => provider.close(() => resolve()));
    }
  });
  it('只有完全未配置时进入演示模式，部分配置不会降级', async () => {
    expect(serviceConfig({})).toMatchObject({ mode: 'demo', ready: true });
    expect(serviceConfig({ LLM_MODEL: 'configured' })).toMatchObject({ mode: 'live', ready: false });
    await expect(modelAdapter({ LLM_MODEL: 'configured' }).generate(request, new AbortController().signal)).rejects.toThrow('配置不完整');
  });
  it('真实请求携带因果上下文，私有密钥仅传给模型服务', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: '回到岸上', text: '她活了下来。' }) } }] })));
    const result = await modelAdapter(environment, fetcher).generate(request, new AbortController().signal);
    expect(result).toMatchObject({ mode: 'live', text: '她活了下来。' });
    const init = fetcher.mock.calls[0][1]!;
    expect(init.headers).toMatchObject({ Authorization: 'Bearer private-fixture-key' });
    const payload = JSON.parse(init.body as string);
    const prompt = JSON.parse(payload.messages[1].content);
    expect(prompt.currentVersionId).toBe('parent-version');
    expect(prompt.selectedPosition).toMatchObject({ start: request.context.before.length,
      end: request.context.before.length + request.context.selected.length });
    expect(payload.messages[1].content).toContain('栈桥断开了。');
    expect(payload.messages[1].content).toContain('她没有回来。');
    expect(JSON.stringify(result)).not.toContain('private-fixture-key');
  });
  it('供应商错误、空输出与超时都报错，不替换成演示内容', async () => {
    await expect(modelAdapter(environment, vi.fn<typeof fetch>().mockResolvedValue(new Response('private-fixture-key', { status: 401 })))
      .generate(request, new AbortController().signal)).rejects.toThrow('401');
    await expect(modelAdapter(environment, vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }))))
      .generate(request, new AbortController().signal)).rejects.toThrow('正文');
    const hanging: typeof fetch = (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort'))));
    await expect(modelAdapter({ ...environment, LLM_TIMEOUT_MS: '1000' }, hanging).generate(request, new AbortController().signal)).rejects.toThrow('超时');
  });
  it('长篇上下文发送有限窗口，仍保留选区和约束', () => {
    const messages = buildMessages({ ...request, context: { ...request.context, before: '前'.repeat(100_000), after: '后'.repeat(20_000) } }, 6_000);
    expect(messages.map(m => m.content).join('').length).toBeLessThanOrEqual(6_000);
    expect(messages[1].content).toContain('栈桥断开了。');
    expect(messages[1].content).toContain('最小改变');
    expect(JSON.parse(messages[1].content).selectedPosition.start).toBe(100_000);
  });
  it('拒绝不正确或过大的请求', () => {
    expect(() => validateRequest({ ...request, context: { ...request.context, selected: '长'.repeat(2001) } })).toThrow();
    expect(() => validateRequest({ ...request, intent: '' })).toThrow();
  });
  it('HTTP 层拒绝外站请求，配置和错误响应不泄露密钥', async () => {
    const app = createApp(environment, vi.fn<typeof fetch>().mockResolvedValue(new Response('private-fixture-key', { status: 503 })));
    app.listen(0, '127.0.0.1'); await once(app, 'listening');
    const url = 'http://127.0.0.1:' + (app.address() as AddressInfo).port;
    try {
      const config = await (await fetch(url + '/api/config')).text();
      expect(config).not.toContain('private-fixture-key');
      const denied = await fetch(url + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' }, body: JSON.stringify(request) });
      expect(denied.status).toBe(403);
      const failed = await fetch(url + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
      expect(failed.status).toBe(502);
      expect(await failed.text()).not.toContain('private-fixture-key');
      const secretFile = await fetch(url + '/.env');
      expect(secretFile.status).toBe(404);
    } finally { await new Promise<void>(resolve => app.close(() => resolve())); }
  });
});

import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { modelAdapter, ModelError, serviceConfig, validateRequest, type Environment } from './model';

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const data = Buffer.from(chunk); size += data.length;
    if (size > 512_000) throw new ModelError('输入过大，本次请求最多支持 500KB。', 413);
    chunks.push(data);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ModelError('请求格式不正确。', 400); }
}
export function createApp(env: Environment = process.env, fetcher: typeof fetch = fetch) {
  const adapter = modelAdapter(env, fetcher);
  return createServer(async (request, response) => {
    const path = new URL(request.url || '/', 'http://localhost').pathname;
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const json = (status: number, data: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(data));
    };
    try {
      if (path === '/api/config' && request.method === 'GET') return json(200, serviceConfig(env));
      if (path === '/api/generate' && request.method === 'POST') {
        if (!request.headers['content-type']?.startsWith('application/json')) return json(415, { error: '请使用 JSON 请求。' });
        const origin = request.headers.origin;
        if (origin) {
          const url = new URL(origin);
          if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || ![String(env.WEB_PORT || 5173), String(env.API_PORT || 8787)].includes(url.port))
            return json(403, { error: '仅接受本地迭页页面的生成请求。' });
        }
        const body = validateRequest(await readBody(request));
        const controller = new AbortController();
        response.on('close', () => { if (!response.writableEnded) controller.abort(); });
        const generated = await adapter.generate(body, controller.signal);
        if (!controller.signal.aborted && !response.destroyed) json(200, generated);
        return;
      }
      if (path.startsWith('/api/')) return json(404, { error: '这个接口不存在。' });
      if (!['GET', 'HEAD'].includes(request.method || '')) return json(405, { error: '不支持这个请求。' });
      const root = resolve('dist'), file = resolve(root, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
      if (!file.startsWith(root + sep) || file.split(sep).some(p => p.startsWith('.'))) return json(404, { error: '文件不存在。' });
      let data: Buffer;
      try { data = await readFile(file); } catch { return json(404, { error: '请先运行 npm run build，或使用 npm run dev。' }); }
      const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
        '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      json(error instanceof ModelError ? error.status : 500,
        { error: error instanceof ModelError ? error.message : '本地服务遇到问题，请重试。' });
    }
  });
}

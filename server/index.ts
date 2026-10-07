import 'dotenv/config';
import { createApp } from './app';

const port = Number(process.env.API_PORT || 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('API_PORT 需要为 1024—65535 的端口。');
const server = createApp();
server.listen(port, '127.0.0.1', () => console.log('迭页本地服务：http://127.0.0.1:' + port));
server.on('error', error => {
  console.error('本地服务启动失败：', (error as NodeJS.ErrnoException).code || '未知错误');
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));

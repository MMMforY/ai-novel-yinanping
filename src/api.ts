import type { GenerationRequest, GenerationResult, ServiceConfig } from '../shared/contracts';

export async function fetchConfig(): Promise<ServiceConfig> {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('本地模型服务暂时不可用，请确认启动命令并重试。');
  return response.json();
}
export async function generate(request: GenerationRequest, signal: AbortSignal): Promise<GenerationResult> {
  const response = await fetch('/api/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || '这次没有生成成功。已有正文和输入已保留，可以重试。');
  if (!data || typeof data.text !== 'string' || !data.text.trim() || !['demo', 'live'].includes(data.mode))
    throw new Error('模型返回的正文无法读取，请重试。');
  return data as GenerationResult;
}

import { LIMITS } from '../shared/contracts';
import type { ChangeMode, GenerationMode, GenerationResult } from '../shared/contracts';

export interface TextAnchor { versionId: string; start: number; end: number; text: string }
export interface ReadingProgress { scrollY: number; ratio: number }
export interface Intervention {
  kind: 'rewrite' | 'continue'; intent: string; mode: ChangeMode;
  anchor?: TextAnchor; sourceText?: string;
}
export interface Worldline {
  id: string; storyId: string; parentId: string | null; kind: 'original' | 'worldline';
  title: string; body: string; createdAt: string; progress: ReadingProgress;
  intervention?: Intervention;
  generations: { operation: string; mode: GenerationMode; model?: string; at: string }[];
}
export interface Story {
  schemaVersion: 1; id: string; title: string; source: 'import' | 'created' | 'demo';
  background: string; originalText: string; createdAt: string; updatedAt: string;
  activeVersionId: string; versions: Worldline[];
}
export function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '').trim();
}
export function newStory(title: string, body: string, source: Story['source'], background = '', generated?: GenerationResult): Story {
  const text = normalizeText(body);
  if (!text || text.length > LIMITS.story) throw new Error('请提供 1—30,000 字的故事片段。');
  const id = crypto.randomUUID(), versionId = crypto.randomUUID(), now = new Date().toISOString();
  return { schemaVersion: 1, id, title: title.trim().slice(0, 80) || '未命名的故事', source,
    background, originalText: body, createdAt: now, updatedAt: now, activeVersionId: versionId,
    versions: [{ id: versionId, storyId: id, parentId: null, kind: 'original', title: '原来的故事',
      body: text, createdAt: now, progress: { scrollY: 0, ratio: 0 },
      generations: generated ? [{ operation: 'create', mode: generated.mode, model: generated.model, at: now }] : [],
    }],
  };
}
export function versionOf(story: Story, id: string): Worldline {
  const version = story.versions.find(v => v.id === id);
  if (!version) throw new Error('这条世界线不存在。');
  return version;
}
export function validateAnchor(body: string, anchor: TextAnchor) {
  if (!Number.isInteger(anchor.start) || !Number.isInteger(anchor.end) || anchor.start < 0 ||
      anchor.end <= anchor.start || anchor.end > body.length || body.slice(anchor.start, anchor.end) !== anchor.text)
    throw new Error('选区已经发生变化，请重新选择这一幕。');
  if (anchor.text.length > LIMITS.selection) throw new Error('一次请选中不超过 2,000 字的片段。');
}
function checkBody(body: string) {
  if (body.length > LIMITS.storedBody) throw new Error('这条世界线已达到 120,000 字，请另开故事。已有正文已保留。');
}
export function rewriteStory(story: Story, anchor: TextAnchor, intent: string, mode: ChangeMode, generated: GenerationResult): Story {
  const parent = versionOf(story, anchor.versionId);
  validateAnchor(parent.body, anchor);
  const replacement = normalizeText(generated.text);
  if (!replacement) throw new Error('没有收到故事正文，请重试。');
  const body = parent.body.slice(0, anchor.start) + replacement;
  checkBody(body);
  const now = new Date().toISOString(), id = crypto.randomUUID();
  return { ...story, updatedAt: now, activeVersionId: id,
    versions: [...story.versions, { id, storyId: story.id, parentId: parent.id, kind: 'worldline',
      title: generated.title || intent.slice(0, 20), body, createdAt: now, progress: { scrollY: 0, ratio: 0 },
      intervention: { kind: 'rewrite', anchor: { ...anchor }, intent, mode, sourceText: parent.body },
      generations: [{ operation: 'rewrite', mode: generated.mode, model: generated.model, at: now }] }],
  };
}
export function continueStory(story: Story, versionId: string, intent: string, generated: GenerationResult): Story {
  const parent = versionOf(story, versionId), now = new Date().toISOString();
  const extra = normalizeText(generated.text);
  if (!extra) throw new Error('没有收到后续正文，请重试。');
  const body = parent.body + '\n\n' + extra;
  checkBody(body);
  const entry = { operation: 'continue', mode: generated.mode, model: generated.model, at: now };
  if (parent.kind === 'original') {
    const id = crypto.randomUUID();
    return { ...story, updatedAt: now, activeVersionId: id,
      versions: [...story.versions, { ...parent, id, parentId: parent.id, kind: 'worldline',
        title: intent ? intent.slice(0, 20) : '故事继续', body, createdAt: now,
        intervention: { kind: 'continue', intent, mode: 'reasonable' }, generations: [...parent.generations, entry] }] };
  }
  return { ...story, updatedAt: now, activeVersionId: parent.id,
    versions: story.versions.map(v => v.id === parent.id ? { ...v, body, generations: [...v.generations, entry] } : v) };
}
export function paragraphSpans(body: string): { text: string; start: number; end: number }[] {
  const spans: { text: string; start: number; end: number }[] = [];
  const regex = /[^\n]+/g; let match: RegExpExecArray | null;
  while ((match = regex.exec(body))) spans.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  return spans;
}

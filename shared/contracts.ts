export const LIMITS = {
  story: 30_000,
  storedBody: 120_000,
  selection: 2_000,
  intent: 600,
  background: 1_200,
  output: 12_000,
} as const;

export const CHANGE_MODES = [
  { id: 'minimal', label: '最小改变', help: '尽量保留人物、设定和主要剧情，只改变必要的因果。' },
  { id: 'reasonable', label: '合理改变', help: '允许命运产生涟漪，让人物和世界仍然说得通。' },
  { id: 'new-world', label: '新世界线', help: '从这一刻起，允许故事自由走向新的方向。' },
] as const;
export type ChangeMode = typeof CHANGE_MODES[number]['id'];
export type Operation = 'create' | 'rewrite' | 'continue';
export type GenerationMode = 'demo' | 'live';
export interface GenerationRequest {
  operation: Operation;
  versionId?: string;
  title: string;
  intent: string;
  mode: ChangeMode;
  context: { before: string; selected: string; after: string; background: string; genres: string[] };
}
export interface GenerationResult {
  title: string;
  text: string;
  mode: GenerationMode;
  model?: string;
}
export interface ServiceConfig {
  mode: GenerationMode;
  ready: boolean;
  message: string;
  contextChars: number;
}

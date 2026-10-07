import { describe, expect, it } from 'vitest';
import { continueStory, newStory, rewriteStory, validateAnchor } from '../src/domain';
import type { GenerationResult } from '../shared/contracts';

const generated: GenerationResult = { title: '她活了下来', text: '她被拉回了岸上。\n\n他们一起走向灯塔。', mode: 'demo' };
describe('故事版本与因果边界', () => {
  it('完整保留导入原稿，阅读排版规范化不改动存档', () => {
    const raw = '\uFEFF  雨还在下。\r\n\r\n她走到了渡口。  \r\n';
    const story = newStory('原稿', raw, 'import');
    const parent = story.versions[0];
    expect(story.originalText).toBe(raw);
    expect(parent.body).toBe('雨还在下。\n\n她走到了渡口。');
    const anchor = { versionId: parent.id, start: 0, end: 5, text: '雨还在下。' };
    const rewritten = rewriteStory(story, anchor, '让她活下来', 'minimal', generated);
    const continued = continueStory(rewritten, rewritten.activeVersionId, '', generated);
    expect(continued.originalText).toBe(raw);
    expect(continued.versions[0].body).toBe(parent.body);
  });
  it('定位第二次出现的相同句子，保留前文、原版和父版本，不拼回冲突后文', () => {
    const story = newStory('重复的雨', '雨还在下。\n\n雨还在下。\n\n她没能回来。', 'import');
    const parent = story.versions[0], start = parent.body.lastIndexOf('雨还在下。');
    const anchor = { versionId: parent.id, start, end: start + 5, text: '雨还在下。' };
    const next = rewriteStory(story, anchor, '让她活下来', 'minimal', generated);
    expect(next.originalText).toBe(story.originalText);
    expect(next.versions[0]).toEqual(story.versions[0]);
    expect(next.versions[1].body).toBe(parent.body.slice(0, start) + generated.text);
    expect(next.versions[1].body).not.toContain('她没能回来。');
    expect(next.versions[1].parentId).toBe(parent.id);
    expect(next.versions[1].intervention?.sourceText).toBe(parent.body);
  });
  it('原版续写建立新版本，世界线续写只追加当前版本', () => {
    const story = newStory('开始', '她站在雨里。', 'import');
    const once = continueStory(story, story.activeVersionId, '', generated);
    expect(once.versions).toHaveLength(2);
    expect(once.versions[0].body).toBe(story.originalText);
    const twice = continueStory(once, once.activeVersionId, '一起寻找真相', generated);
    expect(twice.versions).toHaveLength(2);
    expect(twice.versions[0].body).toBe(story.originalText);
    expect(twice.versions[1].body).toBe(once.versions[1].body + '\n\n' + generated.text);
  });
  it('拒绝已失效的选区以及空输出，不创建残缺版本', () => {
    expect(() => validateAnchor('新的正文', { versionId: 'v', start: 0, end: 2, text: '旧的' })).toThrow('选区');
    const story = newStory('原版', '原来的故事', 'import');
    expect(() => continueStory(story, story.activeVersionId, '', { ...generated, text: '' })).toThrow();
    expect(story.versions).toHaveLength(1);
  });
});

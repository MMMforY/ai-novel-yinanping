// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { paragraphSpans } from '../src/domain';
import { anchorFromRange } from '../src/selection';

function fixture() {
  const body = '雨还在下。\n\n雨还在下。\n她伸出了手。';
  const root = document.createElement('div');
  for (const span of paragraphSpans(body)) {
    const paragraph = document.createElement('p');
    paragraph.dataset.textStart = String(span.start); paragraph.textContent = span.text; root.append(paragraph);
  }
  document.body.replaceChildren(root);
  return { body, root, paragraphs: root.querySelectorAll('p') };
}
describe('DOM 选区映射', () => {
  it('使用真实 Range 端点映射第二处重复文本', () => {
    const { body, root, paragraphs } = fixture(), range = document.createRange();
    range.setStart(paragraphs[1].firstChild!, 0); range.setEnd(paragraphs[1].firstChild!, 5);
    expect(anchorFromRange(root, range, body, 'v')).toEqual({ versionId: 'v', start: 7, end: 12, text: '雨还在下。' });
  });
  it('跨段选择保留源文本换行，嵌套文本节点也定位正确', () => {
    const { body, root, paragraphs } = fixture();
    paragraphs[1].innerHTML = '雨<span>还在下。</span>';
    const range = document.createRange();
    range.setStart(paragraphs[1].querySelector('span')!.firstChild!, 1);
    range.setEnd(paragraphs[2].firstChild!, 2);
    const result = anchorFromRange(root, range, body, 'v')!;
    expect(result.start).toBe(9);
    expect(result.text).toBe(body.slice(9, 15));
  });
  it('忽略正文之外的选区和空选区', () => {
    const { body, root } = fixture(), outside = document.createElement('p');
    outside.textContent = '其他内容'; document.body.append(outside);
    const range = document.createRange(); range.selectNodeContents(outside);
    expect(anchorFromRange(root, range, body, 'v')).toBeNull();
    range.collapse();
    expect(anchorFromRange(root, range, body, 'v')).toBeNull();
  });
});

import type { TextAnchor } from './domain';

function endpoint(root: HTMLElement, node: Node, offset: number): number | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const paragraph = element?.closest<HTMLElement>('[data-text-start]');
  if (!paragraph || !root.contains(paragraph) || !paragraph.contains(node)) return null;
  const prefix = document.createRange();
  prefix.selectNodeContents(paragraph);
  try { prefix.setEnd(node, offset); } catch { return null; }
  return Number(paragraph.dataset.textStart) + prefix.toString().length;
}
export function anchorFromRange(root: HTMLElement, range: Range, body: string, versionId: string): TextAnchor | null {
  if (range.collapsed || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const start = endpoint(root, range.startContainer, range.startOffset);
  const end = endpoint(root, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start || end > body.length) return null;
  const text = body.slice(start, end);
  if (!text.trim()) return null;
  return { versionId, start, end, text };
}

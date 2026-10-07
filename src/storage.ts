import type { Story, ReadingProgress } from './domain';
const NAME = 'dieye-local';
let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('stories', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(new Error('无法打开本地故事库，请检查浏览器是否允许保存网站数据。')); };
    request.onblocked = () => reject(new Error('本地故事库正在升级，请关闭其他迭页标签页后重试。'));
  });
}
export async function loadStories(): Promise<Story[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database.transaction('stories', 'readonly').objectStore('stories').getAll();
    request.onsuccess = () => resolve((request.result as Story[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    request.onerror = () => reject(new Error('读取本地故事失败，请重试。'));
  });
}
export async function saveStory(story: Story) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('stories', 'readwrite');
    transaction.objectStore('stories').put(story);
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(new Error('故事没有保存成功，请检查浏览器存储空间后重试。'));
  });
}
export async function saveProgress(storyId: string, versionId: string, progress: ReadingProgress) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('stories', 'readwrite');
    const store = transaction.objectStore('stories'), request = store.get(storyId);
    request.onsuccess = () => {
      const story = request.result as Story | undefined;
      if (!story) return;
      // Read + update in one transaction; progress must never overwrite newer generated text.
      story.versions = story.versions.map(v => v.id === versionId ? { ...v, progress } : v);
      store.put(story);
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(new Error('阅读位置保存失败。'));
  });
}

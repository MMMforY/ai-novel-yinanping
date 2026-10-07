import { test, expect, type Page } from '@playwright/test';
import { DEMO_TEXT } from '../../shared/demo';
import type { Story } from '../../src/domain';

async function stored(page: Page): Promise<Story[]> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('dieye-local', 1);
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction('stories', 'readonly').objectStore('stories').getAll();
      read.onsuccess = () => { database.close(); resolve(read.result); };
      read.onerror = () => reject(read.error);
    };
    request.onerror = () => reject(request.error);
  }));
}
async function importDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '导入已有故事', exact: true }).click();
  await page.getByRole('button', { name: '填入原创示例「雨停之前」' }).click();
  await page.getByRole('button', { name: '导入并开始阅读' }).click();
  await expect(page.getByTestId('story-body')).toBeVisible();
}
async function selectParagraph(page: Page, index: number) {
  const paragraph = page.getByTestId('story-body').locator('p').nth(index);
  await paragraph.scrollIntoViewIfNeeded();
  await paragraph.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect(page.getByRole('button', { name: '改写这一幕', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '改写这一幕', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.beforeEach(async ({ page, request }) => {
  expect((await (await request.get('/api/config')).json()).mode).toBe('demo');
  await page.goto('/');
  await expect(page.getByText('演示模式', { exact: true })).toBeVisible();
});
test('导入 → 选区 → 改写 → 续读 → 原版；刷新恢复版本与阅读位置', async ({ page }, info) => {
  await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
  await importDemo(page);
  await selectParagraph(page, 4);
  await expect(page.getByRole('button', { name: '最小改变', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('你希望发生什么？').fill('让苏晚活下来');
  await page.screenshot({ path: info.outputPath('rewrite-sheet.png'), fullPage: true });
  let requests = 0;
  page.on('request', r => { if (r.url().endsWith('/api/generate') && r.method() === 'POST') requests++; });
  await page.getByRole('button', { name: '改变命运', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByTestId('rewritten-body')).toContainText('苏晚');
  await expect(page.getByTestId('rewritten-body')).not.toContainText('再也没有回到岸上');
  expect(requests).toBe(1);
  expect((await stored(page))[0].versions).toHaveLength(2);
  await page.screenshot({ path: info.outputPath('worldline.png'), fullPage: true });
  await page.getByRole('button', { name: '沿这条世界线继续' }).click();
  await expect(page.getByTestId('story-body')).toContainText('还来得及');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await expect.poll(async () => (await stored(page))[0].versions[1].progress.scrollY).toBeGreaterThan(100);
  const position = await page.evaluate(() => window.scrollY);
  await page.reload();
  await expect(page.getByTestId('story-body')).toContainText('还来得及');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(position - 50);
  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  await expect(page.getByTestId('story-body')).toContainText('雨声渐渐变轻');
  const story = (await stored(page))[0];
  expect(story.versions).toHaveLength(2);
  expect(story.originalText).toBe(DEMO_TEXT);
  expect(story.versions[0].body).toBe(DEMO_TEXT);
  await page.getByLabel('故事版本').selectOption(story.versions[0].id);
  await expect(page.getByTestId('story-body')).toContainText('再也没有回到岸上');
  await expect(page.getByTestId('story-body')).not.toContainText('雨声渐渐变轻');
});
test('第二处重复句子的选区位置与跨段文字正确', async ({ page }) => {
  const text = '雨还在下。\n\n雨还在下。\n\n她没有回来。';
  await page.getByRole('button', { name: '导入已有故事', exact: true }).click();
  await page.getByLabel('故事正文').fill(text);
  await page.getByRole('button', { name: '导入并开始阅读' }).click();
  await selectParagraph(page, 1);
  await page.getByLabel('你希望发生什么？').fill('让她活下来');
  const wire = page.waitForRequest(r => r.url().endsWith('/api/generate') && r.method() === 'POST');
  await page.getByRole('button', { name: '改变命运', exact: true }).click();
  const request = (await wire).postDataJSON();
  expect(request.context.before).toBe('雨还在下。\n\n');
  expect(request.context.selected).toBe('雨还在下。');
  await expect(page.getByTestId('rewritten-body')).toBeVisible();
  const story = (await stored(page))[0];
  expect(story.versions[1].intervention?.anchor?.start).toBe(7);
  expect(request.versionId).toBe(story.versions[0].id);
  expect(story.versions[1].body.startsWith('雨还在下。\n\n')).toBe(true);
});
test('模型失败保留选区、输入和原版，重试只保存一次', async ({ page }) => {
  await importDemo(page);
  await selectParagraph(page, 4);
  await page.getByLabel('你希望发生什么？').fill('有人及时赶到');
  let fail = true;
  await page.route('**/api/generate', async route => {
    if (fail) { fail = false; await route.fulfill({ status: 502, json: { error: '模型服务暂时不可用，请重试。' } }); }
    else await route.continue();
  });
  await page.getByRole('button', { name: '改变命运', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('请重试');
  await expect(page.getByLabel('你希望发生什么？')).toHaveValue('有人及时赶到');
  expect((await stored(page))[0].versions).toHaveLength(1);
  await page.getByRole('button', { name: '改变命运', exact: true }).click();
  await expect(page.getByTestId('rewritten-body')).toBeVisible();
  expect((await stored(page))[0].versions).toHaveLength(2);
});
test('创建新故事进入阅读器，浏览器退出生成页后忽略旧响应', async ({ page }) => {
  await page.getByRole('button', { name: '开始一个故事', exact: true }).click();
  await page.getByLabel('故事灵感').fill('一个能收到未来来信的大学生');
  await page.getByRole('button', { name: '让故事开始', exact: true }).click();
  await expect(page.getByTestId('story-body')).toContainText('第三封来自未来的信');
  await page.getByRole('button', { name: '返回首页' }).click();
  await page.getByRole('button', { name: '开始一个故事', exact: true }).click();
  await page.getByLabel('故事灵感').fill('一个不应该覆盖当前页面的故事');
  let release!: () => void, settle!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const settled = new Promise<void>(resolve => { settle = resolve; });
  await page.route('**/api/generate', async route => {
    await held;
    try { await route.fulfill({ json: { title: '旧响应', text: '不应该保存的正文', mode: 'demo' } }); } catch { /* request cancelled */ }
    settle();
  });
  await page.getByRole('button', { name: '让故事开始', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('故事正在展开');
  await page.getByRole('button', { name: '返回首页' }).click();
  release(); await settled;
  await expect(page.getByRole('heading', { name: /故事不该只有/ })).toBeVisible();
  expect((await stored(page))).toHaveLength(1);
  await page.getByRole('button', { name: '开始一个故事', exact: true }).click();
  await expect(page.getByLabel('故事灵感')).toHaveValue('一个不应该覆盖当前页面的故事');
});
test('TXT 导入、超限提示与无效编码不丢掉已有输入', async ({ page }) => {
  await page.getByRole('button', { name: '导入已有故事', exact: true }).click();
  await page.getByLabel('选择 TXT 文件').setInputFiles({ name: '渡口.txt', mimeType: 'text/plain', buffer: Buffer.from('雨还在下。\n\n她站在渡口。', 'utf8') });
  await expect(page.getByLabel('故事正文')).toHaveValue('雨还在下。\n\n她站在渡口。');
  await expect(page.getByLabel('故事名称')).toHaveValue('渡口');
  await page.getByLabel('选择 TXT 文件').setInputFiles({ name: '无效.txt', mimeType: 'text/plain', buffer: Buffer.from([255, 254, 128]) });
  await expect(page.getByRole('alert')).toContainText('UTF-8');
  await expect(page.getByLabel('故事正文')).toHaveValue('雨还在下。\n\n她站在渡口。');
  await page.getByLabel('故事正文').fill('长'.repeat(30_001));
  await expect(page.getByRole('button', { name: '导入并开始阅读' })).toBeDisabled();
  await expect(page.getByLabel('故事正文')).toHaveValue('长'.repeat(30_001));
  const raw = '\uFEFF  雨还在下。\r\n\r\n她站在渡口。  \r\n';
  await page.getByLabel('选择 TXT 文件').setInputFiles({ name: '原稿.txt', mimeType: 'text/plain', buffer: Buffer.from(raw, 'utf8') });
  await page.getByRole('button', { name: '导入并开始阅读' }).click();
  await expect(page.getByTestId('story-body')).toContainText('她站在渡口。');
  expect((await stored(page))[0].originalText).toBe(raw);
});
test('干预未来仅追加正文，原版续写先建立世界线', async ({ page }) => {
  await importDemo(page);
  await page.getByRole('button', { name: '干预接下来的剧情' }).click();
  await page.getByLabel('你想让接下来发生什么？').fill('他们找到一封新的信');
  await page.getByRole('button', { name: '让故事向这里生长' }).click();
  await expect(page.getByTestId('story-body')).toContainText('他们找到一封新的信');
  const story = (await stored(page))[0];
  expect(story.versions).toHaveLength(2);
  expect(story.versions[1].body.startsWith(DEMO_TEXT + '\n\n')).toBe(true);
  expect(story.versions[0].body).toBe(DEMO_TEXT);
});
test('再改一次使用父版本的选区与上下文，新增独立世界线', async ({ page }) => {
  await importDemo(page); await selectParagraph(page, 4);
  await page.getByLabel('你希望发生什么？').fill('让她活下来');
  await page.getByRole('button', { name: '改变命运', exact: true }).click();
  await expect(page.getByTestId('rewritten-body')).toBeVisible();
  await page.getByRole('button', { name: '再改一次', exact: true }).click();
  await page.getByLabel('你希望发生什么？').fill('有人及时赶到');
  await page.getByRole('button', { name: '新世界线', exact: true }).click();
  const wire = page.waitForRequest(r => r.url().endsWith('/api/generate') && r.method() === 'POST');
  await page.getByRole('button', { name: '改变命运', exact: true }).click();
  expect((await wire).postDataJSON().context.after).toContain('再也没有回到岸上');
  await expect(page.getByTestId('rewritten-body')).toContainText('钟楼的指针忽然倒转');
  const story = (await stored(page))[0];
  expect(story.versions).toHaveLength(3);
  expect(story.versions[2].parentId).toBe(story.versions[0].id);
  expect(story.originalText).toBe(DEMO_TEXT);
});
test('页面在当前视口没有横向溢出，字号与原版切换可用', async ({ page }) => {
  await importDemo(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Aa', exact: true }).click();
  await page.getByLabel('字号').fill('23');
  await expect(page.getByTestId('story-body')).toHaveCSS('font-size', '23px');
  await page.getByRole('button', { name: '返回首页' }).click();
  await expect(page.getByRole('heading', { name: /故事不该只有/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('桌面真实鼠标拖动触发原生选区与改写浮层', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', '鼠标拖动仅适用于桌面；手机使用原生触摸选区。');
  await importDemo(page);
  const paragraph = page.getByTestId('story-body').locator('p').first();
  await paragraph.scrollIntoViewIfNeeded();
  const box = (await paragraph.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 170, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  const selected = await page.evaluate(() => window.getSelection()?.toString());
  expect(selected?.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: '改写这一幕', exact: true }).click();
  await expect(page.locator('.selected-excerpt')).toHaveText(selected!);
});

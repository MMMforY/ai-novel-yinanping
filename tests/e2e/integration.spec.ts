import { test, expect } from '@playwright/test';

test('联调 HTML：改写、续写、创建，以及失败保留输入后重试', async ({ page }) => {
  await page.goto('/integration.html');
  await page.getByRole('button', { name: '检查连接' }).click();
  await expect(page.locator('#mode')).toHaveText('演示模式');
  await page.getByRole('button', { name: '加载改写样例' }).click();
  const input = await page.getByLabel('请求 JSON').inputValue();
  let fail = true;
  await page.route('**/api/generate', async route => {
    if (fail) { fail = false; await route.fulfill({ status: 502, json: { error: '测试模型错误，请重试。' } }); }
    else await route.continue();
  });
  await page.getByRole('button', { name: '发送生成请求' }).click();
  await expect(page.getByRole('status')).toContainText('测试模型错误');
  await expect(page.getByLabel('请求 JSON')).toHaveValue(input);
  await page.getByRole('button', { name: '重试当前请求' }).click();
  await expect(page.locator('#novel')).toContainText('还来得及');
  await expect(page.locator('#result-mode')).toContainText('演示生成');
  await page.getByRole('button', { name: '把结果作为续写上下文' }).click();
  await page.getByRole('button', { name: '发送生成请求' }).click();
  await expect(page.locator('#novel')).toContainText('雨声渐渐变轻');
  await page.getByRole('button', { name: '加载创建样例' }).click();
  await page.getByRole('button', { name: '发送生成请求' }).click();
  await expect(page.locator('#novel')).toContainText('第三封来自未来的信');
});

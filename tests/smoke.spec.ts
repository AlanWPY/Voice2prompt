import { expect, test } from '@playwright/test';

test('generates a prompt from text and an attachment', async ({ page }) => {
  await page.goto('/');
  await page.locator('.hero-tools .secondary-btn').first().click();
  await expect(page.locator('input[placeholder="模型 ID"]')).toHaveValue('deepseek-ai/DeepSeek-V4-Flash');
  await page.locator('input[type="password"]').fill('');
  await page.locator('.modal-head .icon-btn').click();

  await page.locator('#transcript').fill('请完成附件1中的作业，写成Word文档，需要说明方法、步骤和参考资料。');
  await page.locator('.upload-zone input[type="file"]').setInputFiles('README.md');
  await expect(page.locator('.attachment-item').first()).toBeVisible();

  await page.locator('.generate-btn').click();

  const output = await page.locator('.prompt-output').inputValue();
  expect(output).toContain('Word');
  expect(output).toContain('README.md');
});

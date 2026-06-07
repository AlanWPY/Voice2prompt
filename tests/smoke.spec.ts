import { expect, test } from '@playwright/test';

test('generates a prompt from text and an attachment', async ({ page }) => {
  await page.goto('/');
  await page.locator('#transcript').fill('请完成附件1中的作业，写成Word文档，需要说明方法、步骤和参考资料。');
  await page.locator('.upload-zone input[type="file"]').setInputFiles('README.md');
  await expect(page.locator('.attachment-item').first()).toBeVisible();

  await page.locator('.output-actions .secondary-btn').click();

  const output = await page.locator('.prompt-output').inputValue();
  expect(output).toContain('Word');
  expect(output).toContain('README.md');
});

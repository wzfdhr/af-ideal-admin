import { expect } from '@playwright/test'
import type { Page, Locator } from '@playwright/test'

const findTableRow = async (
  page: Page,
  list: Locator,
  name: string,
  apiPath: string,
  remaining = 100
): Promise<Locator> => {
  expect(
    remaining,
    'record must be reachable through actual pagination'
  ).toBeGreaterThan(0)
  await expect(list.locator('tbody tr').first()).toBeVisible()
  await expect(list.locator('.arco-spin-loading')).toHaveCount(0)
  const row = list.locator('tbody tr').filter({ hasText: name })
  if (await row.count()) return row
  const next = list.locator('.arco-pagination-item-next')
  await expect(next).not.toHaveClass(/arco-pagination-item-disabled/)
  const loaded = page.waitForResponse(
    (response) =>
      response.url().includes(apiPath) &&
      response.request().method() === 'GET' &&
      response.status() === 200
  )
  await next.click()
  await (await loaded).finished()
  return findTableRow(page, list, name, apiPath, remaining - 1)
}
export default findTableRow

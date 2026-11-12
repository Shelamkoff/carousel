import { test, expect } from '@playwright/test'

test('API playground preserves edits through reordering and supports effect toggles', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('link', { name: 'Slide API playground', exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')
  const note = page.getByLabel('Note for card 1', { exact: true })
  await note.fill('Keep this draft')
  await page.getByRole('button', { name: 'Move selected to end', exact: true }).click()
  await expect(page.locator('#status')).toContainText('selected id 0 · index 3')
  await expect(note).toHaveValue('Keep this draft')
  await page.getByRole('button', { name: 'Reverse immutable list', exact: true }).click()
  await expect(page.locator('#status')).toContainText('selected id 0 · index 0')
  await expect(note).toHaveValue('Keep this draft')
  await page.getByLabel('Focus effect', { exact: true }).check()
  await page.getByLabel('Parallax', { exact: true }).check()
  await page.getByLabel('Layout', { exact: true }).selectOption('custom')
  await expect(note).toHaveValue('Keep this draft')
  await page.getByLabel('Parallax', { exact: true }).uncheck()
  await page.getByLabel('Orientation', { exact: true }).selectOption('vertical')
  await expect(note).toHaveValue('Keep this draft')
  await page.getByRole('button', { name: 'Update metadata', exact: true }).click()
  await expect(note).toHaveValue('Keep this draft')
  await page.getByRole('button', { name: 'Refresh selected', exact: true }).click()
  await expect(note).toHaveValue('Draft 1')
  expect(errors).toEqual([])
})

test('API playground supports an empty collection and adding a new card afterward', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/demo-assets/api.html')
  await expect(page.locator('body')).toHaveAttribute('data-status', 'pass')

  const remove = page.getByRole('button', { name: 'Remove selected', exact: true })
  for (let count = 4; count > 0; count--) {
    await remove.click()
    await expect(page.locator('#status')).toContainText(`${count - 1} card`)
  }
  await expect(page.locator('#status')).toContainText('selected id none')
  await expect(remove).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Refresh selected', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Move selected to end', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Reverse immutable list', exact: true })).toBeDisabled()

  await page.getByRole('button', { name: 'Add card', exact: true }).click()
  await expect(page.locator('#status')).toContainText('1 card · selected id 4 · index 0')
  await expect(remove).toBeEnabled()
  const note = page.getByLabel('Note for card 5', { exact: true }).and(page.locator(':not(:disabled)'))
  await note.fill('New draft after clearing')
  await page.getByRole('button', { name: 'Update metadata', exact: true }).click()
  await expect(note).toHaveValue('New draft after clearing')
  expect(errors).toEqual([])
})

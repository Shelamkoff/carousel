import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/__copy_form_validation__', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><link rel="stylesheet" href="/styles/carousel.css">
      <script type="importmap">{"imports":{"@shelamkoff/event-bus":"/demo-assets/event-bus/index.js"}}</script>`,
  }))
  await page.goto('/__copy_form_validation__')
})

for (const lazy of [false, true]) {
  test(`loop copies cannot invalidate a form through custom controls (lazy ${lazy})`, async ({ page }) => {
    const result = await page.evaluate(async lazy => {
      const { Carousel, createLazyLoad } = await import('/src/index.js')
      customElements.define('reconciled-form-field', class extends HTMLElement {
        static formAssociated = true
        constructor() {
          super()
          this.internals = this.attachInternals()
          this.internals.setValidity({ valueMissing: true }, 'Required')
        }
        set value(value) {
          this.internals.setFormValue(value)
          this.internals.setValidity({})
        }
      })
      customElements.define('reconciled-decoration', class extends HTMLElement {})
      const form = document.createElement('form')
      form.style.width = '400px'
      document.body.append(form)
      const original = document.createElement('reconciled-form-field')
      original.setAttribute('name', 'field')
      original.value = 'Valid original'
      const carousel = new Carousel(form, [{ lazy, content: () => {
        const card = document.createElement('article')
        card.append(original, document.createElement('reconciled-decoration'))
        return card
      } }], { loop: true, transitionDuration: 0, plugins: lazy ? [createLazyLoad({ preload: 0 })] : [] })
      try {
        const copy = form.querySelector('[data-carousel-copy] reconciled-form-field')
        return {
          originalValid: original.internals.checkValidity(),
          originalWillValidate: original.internals.willValidate,
          copyExists: !!copy,
          copyWillValidate: copy.internals.willValidate,
          formValid: form.checkValidity(),
          values: [...new FormData(form)],
          decorationDisabled: [...form.querySelectorAll('reconciled-decoration')]
            .some(element => element.hasAttribute('disabled')),
        }
      } finally { carousel.destroy(); form.remove() }
    }, lazy)
    expect(result).toEqual({ originalValid: true, originalWillValidate: true, copyExists: true,
      copyWillValidate: false, formValid: true, values: [['field', 'Valid original']], decorationDisabled: false })
  })
}

# @shelamkoff/carousel

Position-first, framework-agnostic carousel. The core owns slide positioning, loop math, responsive rebuilding, animation cancellation, events, and plugin lifecycle.

## Install

```bash
npm install @shelamkoff/carousel @shelamkoff/event-bus
```

```js
import { Carousel, createArrows, createKeyboard, createSwipe } from '@shelamkoff/carousel'
import '@shelamkoff/carousel/styles.css'

const container = document.querySelector('#carousel')
const carousel = new Carousel(container, [
  { content: () => Object.assign(document.createElement('img'), { src: '/photo.jpg', alt: '' }), thumb: '/thumb-1.jpg' },
  { content: '<p>Trusted application markup</p>' },
], {
  loop: true,
  gap: 16,
  plugins: [createArrows(), createKeyboard(), createSwipe({ mouse: true })],
})

carousel.next()
carousel.update({ slidesPerView: 2, breakpoints: { 900: { slidesPerView: 3 } } })
carousel.destroy()
```

`carouselStylesUrl` exposes the packaged stylesheet. Keyboard navigation is scoped to the focusable carousel container by default; `{ scope: 'document' }` is an explicit opt-in.

## Plugins

- [Arrows](dist/src/plugins/arrows/README.md)
- [Dots](dist/src/plugins/dots/README.md)
- [Thumbnails](dist/src/plugins/thumbnails/README.md)
- [Keyboard](dist/src/plugins/keyboard/README.md)
- [Swipe](dist/src/plugins/swipe/README.md)
- [Autoplay](dist/src/plugins/autoplay/README.md)
- [Lazy load](dist/src/plugins/lazyload/README.md)
- [Parallax](dist/src/plugins/parallax/README.md)

If installation fails, the carousel invokes `plugin.destroy()` and removes all context-owned event subscriptions. Runtime option and breakpoint changes preserve the logical slide and stop obsolete animations before rebuilding.
Install plugins through `use()` or constructor options; `update()` changes layout/behavior options and intentionally rejects `plugins`.
Each stateful plugin instance can belong to only one carousel at a time; destroying its owner releases core ownership so a reusable plugin implementation may be installed again. Slide render failures are isolated to the affected slide and runtime rebuild/lazy failures emit `slide:error`.

## Creating a plugin

A plugin is an object with a unique `name`, an `install(context)` method, and optional `destroy()`. Prefer a factory so every carousel receives an independent stateful instance:

```js
export function createProgressPlugin() {
  let element = null

  return {
    name: 'progress',

    install(context) {
      element = document.createElement('output')
      element.className = 'carousel-progress'
      element.setAttribute('aria-live', 'polite')

      const render = () => {
        element.textContent = `${context.getRealIndex() + 1} / ${context.getSlideCount()}`
      }

      context.getRoot()?.appendChild(element)
      context.on('slide:change', render)
      context.on('resize', render)
      render()
    },

    destroy() {
      element?.remove()
      element = null
    },
  }
}
```

Register it in constructor options or before destruction with `carousel.use(createProgressPlugin())`. `getPlugin(name)` returns the installed public plugin object.

### Plugin context

The frozen context provides:

- owned `on`, `once`, and typed `emit` event methods;
- `next`, `prev`, `goTo`, drag navigation, and snap-back commands;
- read-only slide, index, loop, layout, and resolved-option queries;
- live root, viewport, track, and slide-element getters;
- position/loop-engine methods intended for gesture and visual-effect plugins;
- `refreshLayout()` after a plugin changes relevant DOM measurements.

Subscriptions created through `context.on()` and `context.once()` are removed automatically if installation fails or the carousel is destroyed. A plugin must still remove its DOM, global event listeners, observers, timers, animation frames, object URLs, and third-party instances in `destroy()`.

### Authoring rules

- Do not retain the `Carousel` instance; use the capability-limited context.
- Treat context arrays, slide objects, and `options` as read-only snapshots/views.
- Keep plugin names unique within one carousel.
- Create a fresh plugin object for each concurrently active carousel.
- Make `destroy()` safe after partial installation and safe to call once after normal installation.
- Cancel pointer work and animation frames before releasing referenced DOM.
- Sanitize untrusted strings before assigning HTML; prefer `textContent` and DOM factories.

## Security boundary

String `slide.content` and custom arrow HTML are trusted developer configuration and are assigned as HTML. Use an `HTMLElement` or a render function for untrusted data, or sanitize it before passing it to the library.

The current package version is `1.0.0`. It is ESM, depends on `@shelamkoff/event-bus`, and is released under the MIT License.

# @shelamkoff/carousel

[![npm version](https://img.shields.io/npm/v/%40shelamkoff%2Fcarousel)](https://www.npmjs.com/package/@shelamkoff/carousel)
[![Live demo](https://img.shields.io/badge/demo-live-4357b4)](https://shelamkoff.github.io/carousel/)
[![MIT license](https://img.shields.io/badge/license-MIT-2ea44f)](./LICENSE)

Framework-agnostic, position-based carousel and slider with responsive layouts, loop mode, cancellable transitions, typed events, touch gestures, accessibility, and composable plugins. Published as an ESM package for modern browsers.

[Live demo](https://shelamkoff.github.io/carousel/) · [npm](https://www.npmjs.com/package/@shelamkoff/carousel) · [Русская версия](./README.ru.md)

## Highlights

- Responsive single- and multi-slide layouts with fixed or automatic scroll steps.
- Loop mode, cancellable transitions, keyboard control, touch and mouse gestures.
- Arrows, dots, thumbnails, autoplay, lazy loading, swipe, and parallax plugins.
- Framework-independent lifecycle, typed events, and TypeScript declarations.

## Installation

```bash
npm install @shelamkoff/carousel @shelamkoff/event-bus
```

Import the required stylesheet once in the application:

```js
import '@shelamkoff/carousel/styles.css'
```

`carouselStylesUrl` is also exported when the host needs to create its own `<link>` element.

## Quick start

```html
<div id="gallery"></div>
```

```js
import {
  Carousel,
  createArrows,
  createDots,
  createKeyboard,
  createSwipe,
} from '@shelamkoff/carousel'
import '@shelamkoff/carousel/styles.css'

const carousel = new Carousel('#gallery', [
  {
    content: () => Object.assign(document.createElement('img'), {
      src: '/photos/forest.jpg',
      alt: 'Forest',
    }),
    thumb: '/photos/forest-thumb.jpg',
  },
  { content: '<p>Trusted application markup</p>' },
], {
  loop: true,
  gap: 16,
  plugins: [
    createArrows(),
    createDots(),
    createKeyboard(),
    createSwipe({ mouse: true }),
  ],
})

const unsubscribe = carousel.on('slide:change', ({ index, slide }) => {
  console.log(index, slide.meta)
})

carousel.next()

// Later:
unsubscribe()
carousel.destroy()
```

The container may be an `HTMLElement` or a CSS selector. A selector that does not resolve to an element causes the constructor to throw.

## Slide data

```ts
interface SlideData {
  content: string | HTMLElement | (() => HTMLElement)
  thumb?: string
  lazy?: boolean
  meta?: Record<string, unknown>
}
```

- A render function is the safest choice for dynamic or untrusted data.
- An `HTMLElement` is **cloned** into the carousel with `cloneNode(true)`; listeners registered on the original element are not copied. Use a render function to attach interactive behavior to each rendered element.
- A string is assigned as HTML and is therefore trusted developer input.
- `thumb` is consumed by the thumbnails plugin, `lazy` by lazy loading, and `meta` remains application-owned metadata.

## Configuration

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `slidesPerView` | `number` | `1` | Number of visible slides. Positive values are required. |
| `slidesPerScroll` | `number \| 'auto'` | `1` | Navigation step. `'auto'` uses the resolved visible count. |
| `gap` | `number` | `0` | Gap between slides in CSS pixels. |
| `transition` | `'slide' \| 'fade'` | `'slide'` | Movement strategy. Fade mode displays one slide at a time. |
| `transitionDuration` | `number` | `400` | Transition duration in milliseconds. |
| `loop` | `boolean` | `false` | Circular navigation using positioned originals. In short loops only, inert visual replicas fill the viewport. |
| `startIndex` | `number` | `0` | Initial logical slide index. Used only during construction. |
| `ariaLabel` | `string` | `'Carousel'` | Accessible name for the carousel region. |
| `breakpoints` | `Record<number, Partial<CarouselResponsiveOptions>>` | none | Options applied when the viewport is at least the numeric width. |
| `plugins` | `CarouselPlugin[]` | `[]` | Plugins installed during construction. |

Breakpoint values override base options. The carousel retains existing slide DOM nodes on breakpoint changes and when inserting/removing neighboring slides; an explicit `update()` re-renders slide content (including render callbacks). This makes breakpoint updates less disruptive, while `update()` can replace descendant nodes. Animations are disabled when the user prefers reduced motion (`prefers-reduced-motion: reduce`).

```js
const carousel = new Carousel('#gallery', slides, {
  slidesPerView: 1,
  slidesPerScroll: 'auto',
  breakpoints: {
    640: { slidesPerView: 2, gap: 12 },
    1024: { slidesPerView: 4, gap: 20 },
  },
})
```

## Public API

| Method | Result | Description |
| --- | --- | --- |
| `use(plugin)` | `this` | Installs a plugin. Plugin names must be unique. |
| `getPlugin(name)` | plugin or `undefined` | Returns the installed public plugin object. |
| `next()` / `prev()` | `void` | Moves by the resolved scroll step. |
| `goTo(index)` | `void` | Navigates to a logical slide index. |
| `getIndex()` | `number` | Current logical index (including in loop mode). |
| `getRealIndex()` | `number` | Alias for `getIndex()`, retained for integrations. |
| `getSlide(index?)` | slide or `null` | Returns a logical slide; omitting the index returns the current slide. |
| `getSlides()` | `SlideData[]` | Returns a defensive array copy of slides. |
| `addSlide(slide, index?)` | `void` | Adds a slide and rebuilds the layout. |
| `removeSlide(index)` | `void` | Removes a logical slide and keeps the remaining index valid. |
| `update(options)` | `void` | Updates layout and behavior. `plugins` and `startIndex` are intentionally rejected. |
| `on(event, handler)` | unsubscribe function | Subscribes to an event. |
| `off(event, handler)` | `void` | Removes the exact handler. |
| `once(event, handler)` | unsubscribe function | Subscribes for one emission. |
| `destroy()` | `void` | Cancels animations, destroys plugins, removes generated DOM and listeners. |

Do not call methods after `destroy()`. Create a new instance if the host needs to mount the carousel again.

## Events

| Event | Payload |
| --- | --- |
| `slide:beforeChange` | `{ fromIndex, toIndex }` |
| `slide:change` | `{ index, prevIndex, slide }` |
| `transition:start` | `{ fromIndex, toIndex }` |
| `transition:end` | `{ index }` |
| `resize` | `{ slidesPerView }` |
| `autoplay:start` / `autoplay:stop` | no payload |
| `slide:lazyload` | `{ index, element }` |
| `slide:error` | `{ index, error }` |
| `destroy` | no payload |

Rendering and lazy-load failures are isolated to the affected slide. After construction they are reported through `slide:error`. Initial synchronous render failures are logged to the console because a consumer cannot subscribe until the constructor returns.

## Built-in plugins

- [Arrows](src/plugins/arrows/README.md) — previous and next buttons; edge hiding is enabled by default.
- [Dots](src/plugins/dots/README.md) — clickable pagination.
- [Thumbnails](src/plugins/thumbnails/README.md) — bottom or side thumbnail navigation.
- [Keyboard](src/plugins/keyboard/README.md) — focus-scoped arrow keys by default; document-wide handling is opt-in.
- [Swipe](src/plugins/swipe/README.md) — touch, pointer, resistance, and optional mouse drag.
- [Autoplay](src/plugins/autoplay/README.md) — interval playback with hover and interaction pausing.
- [Lazy load](src/plugins/lazyload/README.md) — observer-based image loading and configurable preloading.
- [Parallax](src/plugins/parallax/README.md) — position-driven visual offset.

Install a plugin in `plugins` or with `use()` before destroying the carousel. A stateful plugin instance may belong to only one live carousel; create a fresh plugin object for every concurrent carousel.

## Creating a plugin

A plugin has a unique `name`, `install(context)`, and optional `destroy()`:

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

      context.getRoot()?.append(element)
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

The frozen context exposes owned event subscriptions, navigation commands, read-only state and resolved options, live DOM getters, position methods for gesture/effect plugins, and `refreshLayout()`. Context subscriptions are removed automatically. The plugin must still release its own DOM, global listeners, observers, timers, animation frames, object URLs, and third-party instances in `destroy()`.

If `install()` throws, the carousel rolls back context subscriptions and invokes the plugin cleanup. Make `destroy()` safe after partial installation.

## Verification

Run `npm test` for the Node regression suite, `npm run typecheck` for public TypeScript API checks, and `npm run build` for the publishable ESM layout. The separate interactive browser regression page is available at `/tests/browser/lifecycle.html` when running `npm run demo` after installing dependencies. Browser tests are **not** included in `npm test` and require a browser.

## Security boundary

String `slide.content` and custom arrow HTML are inserted as HTML. They must contain trusted developer-controlled markup. For user-controlled content, build an element with `textContent` or sanitize the value before passing it to the carousel.

## Demo

[Open the live demo](https://shelamkoff.github.io/carousel/) to try responsive layouts, short fractional loops, autoplay, fade, thumbnails, parallax, custom themes, and fixed scroll steps.

To run the same demo locally:

```bash
npm install
npm run demo
```

Open `http://127.0.0.1:4173/`.

## Package exports

- `@shelamkoff/carousel` — JavaScript API and TypeScript declarations.
- `@shelamkoff/carousel/styles.css` — required carousel styles.
- `@shelamkoff/carousel/package.json` — package metadata.

## License

MIT.

# @shelamkoff/carousel

[![npm version](https://img.shields.io/npm/v/%40shelamkoff%2Fcarousel)](https://www.npmjs.com/package/@shelamkoff/carousel)
[![Live demo](https://img.shields.io/badge/demo-live-4357b4)](https://shelamkoff.github.io/carousel/)
[![MIT license](https://img.shields.io/badge/license-MIT-2ea44f)](./LICENSE)

Framework-agnostic, position-based carousel and slider with responsive layouts, loop mode, cancellable transitions, typed events, touch gestures, accessibility, and composable plugins. Published as an ESM package for modern browsers.

[Live demo](https://shelamkoff.github.io/carousel/) · [npm](https://www.npmjs.com/package/@shelamkoff/carousel) · [Русская версия](./README.ru.md)

## Highlights

- Responsive single- and multi-slide layouts with fixed or automatic scroll steps.
- Loop mode, slide/fade and stairs/pixel/curtain transitions, keyboard control, touch and mouse gestures.
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
| `transition` | `CarouselTransition` | `'slide'` | Slide, fade, stairs, pixel or curtain. See transitions below. |
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

## Transitions

| Value | Effect |
| --- | --- |
| `'slide'` | Move the track to the next position. |
| `'fade'` | Cross-fade single-slide views; multi-slide views use track movement. |
| `'stairs'` | Vertical panels cover the viewport and leave in a staggered cascade. |
| `'pixel'` | A grid of tiles covers and reveals the viewport in a deterministic order. |
| `'curtain'` | Two vertical halves close, then part horizontally. |

The three reveal effects work across the whole viewport, including loop and multi-slide layouts. `transitionDuration` is the total time for both cover and reveal. The destination is shown when the panels fully cover the viewport. The panels are decorative: they do not clone slide contents or change form values and custom-element instances. All effects honor reduced motion.

```js
const carousel = new Carousel('#gallery', slides, {
  transition: 'pixel',
  transitionDuration: 800,
})

carousel.update({ transition: 'curtain' })
```

Set the reveal panel color with a CSS custom property on the host element:

```css
#gallery {
  --carousel-transition-color: #17181b;
}
```

## Theming

Set `--carousel-*` properties on the element passed to `new Carousel()`, a theme wrapper, or `:root`. The generated carousel inherits them. Defaults are fallbacks at each use site, so a theme can be declared before or after the library stylesheet without `!important` or selectors tied to the internal markup.

```css
#gallery {
  --carousel-radius: 12px;
  --carousel-arrow-bg: #202733;
  --carousel-arrow-bg-hover: #344258;
  --carousel-arrow-color: #f4f7fc;
  --carousel-arrow-color-hover: #fff;
  --carousel-arrow-border: 1px solid #526078;
  --carousel-arrow-radius: 8px;
  --carousel-dot-bg: #66748a;
  --carousel-dot-bg-hover: #c4d7ff;
  --carousel-dot-bg-active: #9abaff;
  --carousel-thumb-border-color-active: #9abaff;
  --carousel-focus-color: #9abaff;
  --carousel-transition-color: #202733;
}

@media (max-width: 480px) {
  #gallery {
    --carousel-arrow-size: 32px;
    --carousel-arrow-icon-size: 18px;
    --carousel-thumb-width: 48px;
    --carousel-thumb-height: 32px;
  }
}
```

Changing a host class, data attribute, or custom property updates the theme immediately; no `carousel.update()` call is needed. Each host can have its own theme. Host styles also survive carousel rebuilds and destroy/remount cycles.

[Try Light, Dark and Compact themes in the live demo](https://shelamkoff.github.io/carousel/#theming-example).

### Theme properties

All names below have the `--carousel-` prefix.

| Properties | Defaults and purpose |
| --- | --- |
| `radius`, `transition-color` | Viewport clipping radius `0`; reveal panels `#17181b`. |
| `arrow-size`, `arrow-icon-size`, `arrow-offset` | Button `40px`, built-in SVG `24px`, distance from the viewport edge `12px`. |
| `arrow-bg`, `arrow-bg-hover` | `rgba(255, 255, 255, 0.9)` / `#fff`. |
| `arrow-color`, `arrow-color-hover` | `#333` / `#111`; built-in icons use `currentColor`. |
| `arrow-border`, `arrow-radius` | `none` / `50%`. |
| `arrow-shadow`, `arrow-shadow-hover` | `0 2px 8px rgba(0, 0, 0, 0.15)` / `0 4px 12px rgba(0, 0, 0, 0.2)`. |
| `dots-gap`, `dots-padding` | `8px` / `12px 0`. |
| `dot-size`, `dot-width`, `dot-height` | Size `10px`; width and height fall back to size, allowing pill-shaped dots. |
| `dot-bg`, `dot-bg-hover`, `dot-bg-active` | Black with opacity `0.2` / `0.4` / `0.7`. |
| `dot-radius`, `dot-scale-active` | `50%` / `1.2`. |
| `thumb-width`, `thumb-height` | Override the plugin's numeric `width` / `height` options (`60px` / `40px` by default). Dimensions include the border. |
| `thumb-gap`, `thumb-padding` | `6px` / `8px 0`; padding applies to the bottom strip. |
| `thumb-border-width`, `thumb-border-color`, `thumb-border-color-active` | `2px` / `transparent` / `#333`. |
| `thumb-radius`, `thumb-opacity`, `thumb-opacity-hover`, `thumb-opacity-active` | `4px` / `0.6` / `0.9` / `1`. |
| `focus-color`, `focus-width`, `focus-offset` | `currentColor` / `2px` / `3px`; keyboard focus on the region and controls. |
| `control-duration`, `control-timing` | `200ms` / `ease`; visual state changes on arrows, dots and thumbnails. |
| `lazy-fade-duration` | `300ms`; the lazy-content appearance animation. |

For a complete custom design, style `.carousel__arrow`, `.carousel__dot` and `.carousel__thumb` with ordinary CSS after the library stylesheet. Selected dots and thumbnails expose `.carousel__dot--active`, `.carousel__thumb--active` and `aria-current="page"`; hover and keyboard focus use the usual pseudo-classes. Custom arrow HTML keeps its own dimensions; the icon-size token applies only to the built-in `.carousel__arrow-icon`. Slide contents are application-owned and can use your existing typography, backgrounds and spacing.

Keep slide geometry in the JavaScript options: `gap`, `slidesPerView`, `slidesPerScroll` and `breakpoints`. Navigation duration is `transitionDuration`; `control-duration` only styles controls. `--carousel-gap` reflects the resolved JS gap for internal effects, and should not be used to change layout. The old, unused `--carousel-transition-duration` and `--carousel-transition-timing` declarations are no longer advertised. Avoid overriding positioning and transforms on the track and slide wrappers. All built-in decorative motion respects reduced motion.

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

Run `npm ci` for the locked development dependencies, then `npm run check` to execute the Node regression suite, check the public TypeScript API, and rebuild the ESM package and local demo dependency. GitHub Actions checks Node 20.19, 22 and 24, and rejects an out-of-date committed distribution. The committed `dist` also supports Git installs with lifecycle scripts disabled.

Run `npx playwright install chromium` once, then `npm run test:browser` for Chromium integration tests of navigation, forms, same-origin iframes, live examples and lifecycle cleanup. To use an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. The diagnostic page is available at `/tests/browser/lifecycle.html` with `npm run demo`.

## Security boundary

String `slide.content` and custom arrow HTML are inserted as HTML. They must contain trusted developer-controlled markup. For user-controlled content, build an element with `textContent` or sanitize the value before passing it to the carousel.

## Demo

[Open the live demo](https://shelamkoff.github.io/carousel/) to try responsive layouts, short fractional loops, autoplay, fade, thumbnails, parallax, custom themes, fixed scroll steps, auto-height media, dynamic collections, lazy rendering and all three reveal transitions. The demo's JavaScript and illustrations are served locally; no third-party CDN is needed at runtime.

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

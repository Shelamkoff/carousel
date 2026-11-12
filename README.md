# @shelamkoff/carousel

[![npm version](https://img.shields.io/npm/v/%40shelamkoff%2Fcarousel)](https://www.npmjs.com/package/@shelamkoff/carousel)
[![Live demo](https://img.shields.io/badge/demo-live-4357b4)](https://shelamkoff.github.io/carousel/)
[![MIT license](https://img.shields.io/badge/license-MIT-2ea44f)](./LICENSE)

Framework-agnostic, position-based carousel and slider with responsive layouts, loop mode, cancellable transitions, typed events, touch gestures, accessibility, and composable plugins. Published as an ESM package for modern browsers.

[Live demo](https://shelamkoff.github.io/carousel/) · [Slide API playground](https://shelamkoff.github.io/carousel/demo-assets/api.html) · [npm](https://www.npmjs.com/package/@shelamkoff/carousel) · [Русская версия](./README.ru.md)

## Highlights

- Responsive single- and multi-slide layouts with fixed or automatic scroll steps.
- Loop mode, 14 built-in transitions, custom effects, keyboard control, touch and mouse gestures.
- Arrows, dots, thumbnails, autoplay, lazy loading, swipe, and parallax plugins.
- Framework-independent lifecycle, typed events, and TypeScript declarations.
- Keyed slide updates, reordering and collection replacement that preserve unchanged content.
- Custom numeric layouts and composable content effects on the shared render timeline.

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
  id?: string | number
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
- `id` is an optional stable identity for immutable collection updates. It must be a non-empty string or a finite number, unique within the collection; numeric `1` and string `'1'` are distinct. Without `id`, reconciliation uses the slide object's identity. See [changing slides](#changing-slides-without-remounting).

## Configuration

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `slidesPerView` | `number` | `1` | Number of visible slides; positive fractions such as `1.15` and `2.25` are supported. |
| `slidesPerScroll` | `number \| 'auto'` | `1` | Navigation step. `'auto'` uses the resolved visible count. |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Navigation, layout, keyboard, swipe and parallax axis. |
| `layout` | `CarouselLayout` | `'standard'` | `'standard'`, `'expand'`, or a custom numeric geometry definition. |
| `expandVisible` | `number` | `2.5` | Number of compact-card equivalents used by the expanding layout (fractions supported). |
| `expandRatio` | `number` | `2.5` | Active-to-compact card size ratio; at least 1. |
| `expandPeek` | `number` | `32` | Leading inset in pixels, limited to a quarter of the viewport. |
| `viewportHeight` | `number` | CSS `400px` | Positive viewport height in CSS pixels, used only in vertical mode. Omit to use `--carousel-vertical-height`. |
| `gap` | `number` | `0` | Gap between slides in CSS pixels. |
| `transition` | `CarouselTransition` | `'slide'` | A built-in name or a custom transition definition. See transitions below. |
| `transitionDuration` | `number` | `400` | Transition duration in milliseconds. |
| `loop` | `boolean` | `false` | Circular navigation using positioned originals. In short loops only, inert visual replicas fill the viewport. |
| `startIndex` | `number` | `0` | Initial logical slide index. Used only during construction. |
| `ariaLabel` | `string` | `'Carousel'` | Accessible name for the carousel region. |
| `breakpoints` | `Record<number, Partial<CarouselResponsiveOptions>>` | none | Options applied when the viewport is at least the numeric width. |
| `plugins` | `CarouselPlugin[]` | `[]` | Plugins installed during construction. |

Breakpoint values override base options. The carousel retains unchanged slide DOM on breakpoint changes, collection mutations and `update(options)`. **Migration:** `update()` no longer reruns content renderers. Use `refresh(index)` for one slide or `refresh()` for the collection when an explicit content reset is needed. Navigation animations are disabled when the user prefers reduced motion (`prefers-reduced-motion: reduce`).

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

### Fractional and vertical galleries

`slidesPerView` is not rounded. `1.15` and `2.25` show a partial next slide, with the specified `gap`; they work in finite and loop layouts. `slidesPerScroll: 'auto'` advances the whole-number portion (at least one), while an explicit positive integer controls the step independently.

```js
const gallery = new Carousel('#gallery', slides, {
  orientation: 'vertical',
  viewportHeight: 420,
  slidesPerView: 1.15,
  gap: 16,
  loop: true,
  plugins: [createArrows(), createKeyboard(), createSwipe({ mouse: true })],
})
gallery.update({ slidesPerView: 2.25 })
```

Vertical mode uses Up/Down keys, vertical dragging and top/bottom arrows. Cross-axis touch scrolling and pinch zoom remain available. A vertical gallery needs a bounded viewport: use `viewportHeight`, or omit it and set `--carousel-vertical-height: clamp(280px, 60vh, 520px)` on the host. The CSS fallback is `400px`. Horizontal mode keeps its content-driven height. Both options can be changed through `update()` or breakpoints; breakpoint thresholds still refer to window width. All transition presets work with either orientation; mask designs such as `stairs-horizontal` retain their own visual direction.

[Try fractional slides, vertical navigation and themed controls](https://shelamkoff.github.io/carousel/?orientation=vertical&slidesPerView=1.15#gallery-example).

### Expanding editorial cards

Set `layout: 'expand'` to display one prominent card and narrower adjacent previews. This is a **layout**, not an overlay transition: the same position-driven animation resizes the cards and exposes a continuous `--carousel-expand-focus` value (0…1) on each slide. The supplied CSS animates the caption, font size and supporting text when your card uses `carousel__expand-card`, `carousel__expand-image`, `carousel__expand-caption`, `carousel__expand-title` and `carousel__expand-meta` classes. Your own HTML and CSS can consume the focus variable instead.

```js
const carousel = new Carousel('#stories', storySlides, {
  layout: 'expand',
  slidesPerView: 1,       // exactly one logical active slide
  expandVisible: 2.45,   // active card plus partial neighboring previews
  expandRatio: 2.6,
  expandPeek: 28,
  gap: 16,
  loop: true,
  transitionDuration: 650,
  plugins: [
    createArrows(), createSwipe({ mouse: true }), createKeyboard(),
    createAutoplay({ interval: 5500 }),
    createControls({ progress: 'bar', playPause: true, counter: true }),
  ],
})
```

The layout keeps `slidesPerView: 1` so finite navigation, swipes, dots and the counter still refer to individual cards. Use `expandVisible` to set the visual preview count. `expandRatio` and `expandVisible` must be at least 1; `expandPeek` must be non-negative. `fade` cannot be combined with the expanding layout; positional `slide` and decorative cover presets are supported. Both orientations, responsive breakpoints, updates, short loops and reduced motion are supported. Set height with `--carousel-expand-height` in horizontal mode, and use `viewportHeight` for vertical mode. CSS theme tokens include `--carousel-expand-radius`, `--carousel-expand-inset`, `--carousel-expand-badge-bg`, `--carousel-expand-card-bg`, and `--carousel-expand-scrim`.

[Try expanding cards in the live demo](https://shelamkoff.github.io/carousel/#expand-example).

### Playback controls, elapsed time and counter

`createControls()` adds optional UI. It can be installed before or after `createAutoplay()`; playback and time progress are visible only when autoplay is installed. The counter also works without autoplay.

```js
const controls = createControls({
  playPause: true,
  progress: 'circle', // 'circle', 'bar', or false
  counter: true,
  position: 'below', // 'below' or 'overlay'
  labels: { play: 'Play slideshow', pause: 'Pause slideshow' },
})
const gallery = new Carousel('#gallery', slides, {
  slidesPerView: 2.25,
  gap: 16,
  loop: true,
  plugins: [
    createArrows(), createSwipe({ mouse: true }),
    createAutoplay({ interval: 4500, pauseOnInteraction: false }),
    controls,
  ],
})
controls.update({ progress: 'bar', counter: false })
```

Each visibility option is independent and can be updated without remounting the carousel. Progress uses the autoplay deadline: pause freezes it, Play resumes the remaining time, and the next slide gets a full display interval after its transition. Hover, keyboard focus and hidden tabs suspend playback. Explicit Play can resume while its button is hovered/focused; moving focus into another control pauses again. `pauseOnInteraction` defaults to `true`; use `false` to continue after manual navigation. See [Autoplay](src/plugins/autoplay/README.md) and [Controls](src/plugins/controls/README.md) for the API and localization options.

The counter displays the selected logical slide and total source count, for example `1 / 7`, or `0 / 0` for an empty carousel. Visual copies are excluded. In a finite multi-slide layout the final selection can be `6 / 7` because slide 7 is already visible beside slide 6. It is a slide counter, not a page count. `formatCounter(current, total)` customizes its text safely.

## Transitions

| Value | Effect |
| --- | --- |
| `'slide'` | Move the track to the next position. |
| `'fade'` | Cross-fade single-slide views; multi-slide views use track movement. |
| `'stairs'` | Vertical panels cover the viewport and leave in a staggered cascade. |
| `'stairs-horizontal'` | Eight horizontal rows sweep in alternating directions: left to right, then right to left. Backward navigation reverses the row stagger. |
| `'pixel'` | A grid of tiles covers and reveals the viewport in a deterministic order. |
| `'curtain'` | Two vertical halves close, then part horizontally. |
| `'diamond-wipe'` | A centered diamond expands to cover the viewport, then contracts. |
| `'directional-wipe'` | A diagonal edge crosses the viewport; backward navigation mirrors the sweep. |
| `'clock-wipe'` | A radial sector sweeps around the center; backward navigation reverses the rotation. |
| `'aperture-wipe'` | A rotating six-sided camera aperture closes and opens. |
| `'polka-dots'` | A wave of growing circles spreads from a corner; the grid adapts to the viewport. |
| `'grid-flip'` | 32 decorative tiles rotate in a staggered diagonal wave. |
| `'doorway'` | Two hinged decorative panels close and open with perspective. |
| `'water-drop'` | A circular wash with concentric ripples covers and reveals the slide. |

The reveal effects work across the whole viewport, including loop and multi-slide layouts. `transitionDuration` is the total time for both cover and reveal. The destination is shown when the panels fully cover the viewport. The panels are decorative: they do not clone slide contents or change form values and custom-element instances. All effects honor reduced motion.

The eight additional presets are native CSS interpretations of transition patterns. Grid flip and Doorway animate theme-colored panels; Water drop animates a circular cover and ripples. They do not distort photo textures or require WebGL, canvas snapshots, external image URLs, or additional dependencies. They also work with forms, video and arbitrary HTML. Each effect uses at most 64 decorative elements, measures geometry only when created, and shares the carousel's animation clock and cleanup lifecycle.

[Preview every effect in the live demo](https://shelamkoff.github.io/carousel/#transitions-example). Choose a preset to play it, adjust its duration and cover color, or use **Link to this effect** to share the selection.

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
  --carousel-transition-highlight: rgba(255, 255, 255, 0.18);
}
```

### Custom transitions

Pass a `CarouselTransitionDefinition` directly as `transition`; there is no global registration or core modification. Each navigation calls `create()` for a fresh renderer. The same definition can be shared by carousels and used in `update()` or breakpoints.

```js
const iris = {
  name: 'iris',
  create({ container, direction }) {
    const panel = container.ownerDocument.createElement('div')
    Object.assign(panel.style, {
      position: 'absolute', inset: '0',
      background: 'var(--carousel-transition-color, #17181b)',
    })
    container.appendChild(panel)
    return {
      render(progress) {
        const cover = progress < 0.5 ? progress * 2 : (1 - progress) * 2
        const eased = cover * cover * (3 - 2 * cover)
        panel.style.clipPath = `circle(${eased * 75}% at 50% 50%)`
      },
    }
  },
}

carousel.update({ transition: iris, transitionDuration: 800 })
carousel.on('transition:error', ({ name, error }) => console.error(name, error))
```

`container` is an owned, clipped, inert decorative layer; create elements with its `ownerDocument`. `direction` is `1` for forward movement and `-1` for backward movement, including loop wraps. The iris is symmetric and does not need direction. Work only inside this layer; do not move or clone live slides. Its children inherit the carousel's theme.

`create()` and `render()` are synchronous. Progress runs from `0` to `1`: the layer must be clear at both ends and fully cover the viewport at `0.5`. Carousel renders that exact boundary before switching slides, even if a frame is delayed. It owns the clock, duration, reduced motion, interruption and events. Reduced motion or a zero duration skips factory creation and completes navigation immediately. On viewport resize the pending destination is settled and the effect is removed.

An optional `destroy()` releases resources created outside the layer, such as observers or third-party instances; the layer itself is removed automatically. Cleanup also runs on cancellation, failure, and if a factory synchronously updates or destroys the carousel before returning. A throwing factory must release any external resources it allocated before it could return a cleanup hook. Errors are reported through `transition:error`; setup/render failures settle the current destination immediately. A callback that has already updated or destroyed the carousel takes precedence, so obsolete work never completes afterward. Definitions and their renderers are trusted application code, like slide factories and plugins.

## Custom layouts and content effects

Three extension points can be combined: `layout` supplies slide geometry, `createSlideEffect()` animates slide contents, and `transition` draws a decorative cover during navigation. They use the core position and clock; no transform parsing or separate `requestAnimationFrame` loop is needed.

### Numeric layout contract

```js
const compactLayout = {
  name: 'compact',
  render({ slides }) {
    return slides.map(slide => ({
      offset: slide.offset * 0.9,
      size: slide.size * 0.85,
      progress: slide.progress,
    }))
  },
}

carousel.update({ layout: compactLayout, slidesPerView: 1.6, transition: 'slide' })
```

`CarouselLayoutDefinition.render(context)` is synchronous. Its frozen input contains `position`, `step`, `viewportSize`, `gap`, `count`, `loop`, `orientation`, and an ordered `slides` array. Each visual slot contains `index`, `copy`, `isCopy`, `offset`, `size`, and `progress`; `copy: 0` is the original. Short loops can include inert visual copies of the same logical slide. The callback receives numbers and flags, without DOM nodes.

Return one `{ offset, size, progress? }` record for **every input slot, in the same order**, including copies. `offset` is relative to the viewport's leading edge and `size` is the main-axis dimension, both in CSS pixels. Values must be finite and `size` must be non-negative. Omitted `progress` retains the canonical signed distance in logical slide steps. The core applies the geometry along the current horizontal or vertical axis.

The layout changes visual geometry. `slidesPerView`, `gap` and `slidesPerScroll` still determine logical navigation, swipe distances, finite bounds and loop slots. Choose these options to match the intended visible range. A layout does not introduce a separate navigation model. Definitions can be used at construction, in `update()` and in breakpoints; `fade` requires `layout: 'standard'`.

An invalid return or throwing callback emits `layout:error` and falls back to standard geometry until the next rebuild. The whole return is validated before any geometry is applied. Treat the callback as a pure calculation: avoid layout reads, asynchronous work and DOM changes inside it.

### Effects on slide contents

```js
import { createSlideEffect, createFocusEffect } from '@shelamkoff/carousel'

const captionEffect = createSlideEffect({
  name: 'caption',
  create({ setStyle }) {
    return {
      render(frame) {
        for (const slide of frame.slides) {
          const caption = slide.element.querySelector('.caption')
          const distance = frame.reducedMotion ? 0 : (1 - slide.focus) * 24
          setStyle(caption, 'translate', `0 ${distance}px`)
          setStyle(caption, 'opacity', String(0.65 + slide.focus * 0.35))
        }
      },
    }
  },
})

carousel.use(captionEffect)
const focusEffect = createFocusEffect({
  selector: '.card', scale: 0.92, opacity: 0.7, offset: 12,
})
carousel.use(focusEffect)

// Remove either effect and restore the inline properties it owns.
carousel.unuse(captionEffect.name) // name is 'effect:caption'
```

An effect is a regular removable plugin. `create()` receives the carousel `root`, `viewport` and managed `setStyle(element, property, value)`. Return a synchronous `render(frame)` and optional `destroy()`. Rendering runs initially and on core updates, including navigation, dragging, resizing, lazy rendering and collection changes. It does not poll while idle.

Use `setStyle` with CSS property names such as `'opacity'`, `'translate'` or `'--caption-focus'`. A `null` element is ignored; a `null` value releases that property. Ordinary CSS properties can be applied to owned content descendants. Core positioning elements—the root, viewport, track and slide wrappers—accept only CSS custom properties. Nested carousels and unrelated page elements are outside the effect's scope. Managed styles restore during rebuild, removal or failure; other active effect owners and newer application writes are preserved. Release properties from targets your effect stops using.

`createFocusEffect()` is a ready-made example of this contract: inactive `scale` defaults to `0.9`, `opacity` to `0.6`, and cross-axis `offset` to `0`. Scale and opacity must be within `0…1`. Without `selector`, it targets each slide's direct children. An optional `name` permits several independently removable focus effects. Reduced motion disables its scale and displacement; custom effects should also check `frame.reducedMotion` for their own motion.

Effect creation, rendering and cleanup must be synchronous. Creation or render failures emit `effect:error`, retire the failed effect renderer and restore its managed styles. Remove and reinstall the plugin to retry. `destroy()` must release external observers, listeners or other resources allocated by the effect; a throwing factory must clean up resources it allocated before it could return `destroy()`.

### Render snapshots

`carousel.getRenderState()` returns a frozen `CarouselRenderState` snapshot, or `null` after destruction. Subscribe to `render` for updates. It describes the latest core frame and contains live element references without reading their bounding rectangles:

| Field | Meaning |
| --- | --- |
| `position`, `step`, `viewportSize`, `orientation` | Canonical position, navigation step, viewport main-axis size and axis. |
| `index`, `selectedIndex`, `fromIndex` | Current logical position index, selected destination, and transition origin. |
| `phase`, `direction`, `transitionProgress` | `'idle'`, `'drag'` or `'animation'`; direction `-1`, `0` or `1`; linear progress `0…1`, or `null` outside animation. |
| `revision`, `reducedMotion` | Structural render revision and the current motion preference. |
| `slides` | Ordered visual slots, including inert loop copies. Each exposes `element`, `index`, `copy`, `isCopy`, `offset`, `size`, `progress`, `focus` and `visible`. |

`progress` is the signed distance from focus; `focus = max(0, 1 - abs(progress))`. `visible` is the intersecting fraction of the slot's size, not an occlusion or painted-pixel measurement. Use `isCopy` when attaching behavior: copies are decorative, and `getSlideElements()` returns originals only. Frozen snapshots do not freeze the referenced DOM elements. `render:reset` announces that structure or managed styles are about to be rebuilt; discard cached descendants then.

Expand and custom layouts also expose `--carousel-slide-progress`, `--carousel-slide-focus` and the compatibility alias `--carousel-expand-focus` on their slide wrappers for CSS-driven content styling.

[Try keyed mutations, custom geometry and effect toggles](https://shelamkoff.github.io/carousel/demo-assets/api.html).

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
| `transition-highlight` | `rgba(255, 255, 255, 0.18)`; aperture blades, tile edges, doorway lighting and ripples. |
| `vertical-height` | `400px`; vertical viewport height when `viewportHeight` is omitted. |
| `controls-align`, `controls-gap`, `controls-padding` | `center`, `12px`, `12px 0`; overlay padding defaults to `6px 12px`. |
| `controls-bg`, `controls-color`, `controls-border`, `controls-radius`, `controls-offset` | Background, foreground, border and corner radius; overlay edge offset `12px`. |
| `play-size`, `play-icon-size`, `play-radius`, `play-border` | `40px`, `20px`, `50%`, `1px solid currentColor`. |
| `play-bg`, `play-bg-hover`, `play-color`, `play-color-hover` | Playback button surfaces and colors; icon inherits `currentColor`. |
| `progress-size`, `progress-stroke`, `progress-color`, `progress-track` | Ring `32px`, stroke `3`, foreground `currentColor`, track gray at 25% opacity. |
| `progress-width`, `progress-height`, `progress-radius` | Bar `96px` × `4px`, radius `999px`. |
| `counter-color`, `counter-size`, `counter-weight` | Inherited color, `14px`, `500`; tabular numerals. |
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
| `control-duration`, `control-timing` | `200ms` / `ease`; visual state changes on arrows, dots, thumbnails and playback buttons. |
| `lazy-fade-duration` | `300ms`; the lazy-content appearance animation. |

For a complete custom design, style `.carousel__arrow`, `.carousel__dot` and `.carousel__thumb` with ordinary CSS after the library stylesheet. Selected dots and thumbnails expose `.carousel__dot--active`, `.carousel__thumb--active` and `aria-current="page"`; hover and keyboard focus use the usual pseudo-classes. Custom arrow HTML keeps its own dimensions; the icon-size token applies only to the built-in `.carousel__arrow-icon`. Slide contents are application-owned and can use your existing typography, backgrounds and spacing.

Keep slide geometry in the JavaScript options: `gap`, `slidesPerView`, `slidesPerScroll` and `breakpoints`. Navigation duration is `transitionDuration`; `control-duration` only styles controls. `--carousel-gap` reflects the resolved JS gap for internal effects, and should not be used to change layout. The old, unused `--carousel-transition-duration` and `--carousel-transition-timing` declarations are no longer advertised. Avoid overriding positioning and transforms on the track and slide wrappers. All built-in decorative motion respects reduced motion.

## Public API

| Method | Result | Description |
| --- | --- | --- |
| `use(plugin)` | `this` | Installs a plugin. Plugin names must be unique. |
| `unuse(name)` | `boolean` | Removes a plugin and runs cleanup; returns `false` if no such plugin is installed. |
| `getPlugin(name)` | plugin or `undefined` | Returns the installed public plugin object. |
| `next()` / `prev()` | `void` | Moves by the resolved scroll step. |
| `goTo(index)` | `void` | Navigates to a logical slide index. |
| `getIndex()` | `number` | Current logical index (including in loop mode). |
| `getRealIndex()` | `number` | Alias for `getIndex()`, retained for integrations. |
| `getSlide(index?)` | slide or `null` | Returns a logical slide; omitting the index returns the current slide. |
| `getSlides()` | `SlideData[]` | Returns a defensive array copy of slides. |
| `getSlideCount()` | `number` | Number of logical slides, excluding decorative copies. |
| `getSlideElement(index?)` | element or `null` | Returns the original slide wrapper; defaults to the current logical slide. |
| `getSlideElements()` | `HTMLElement[]` | Defensive array of original slide wrappers in collection order. |
| `getRenderState()` | snapshot or `null` | Latest immutable numeric frame with references to visual elements. |
| `updateSlide(index, patch)` | `void` | Shallow-merges supplied fields. Content replacement affects only that slide; `id` stays fixed. |
| `moveSlide(from, to)` | `void` | Moves a slide to its final array index and retains the selected slide by identity. |
| `setSlides(slides)` | `void` | Reconciles the collection by `id`, or object identity for slides without an `id`. |
| `refresh(index?)` | `void` | Explicitly resets one slide's content, or the whole collection when omitted. Lazy slides render again when requested. |
| `addSlide(slide, index?)` | `void` | Adds a slide and rebuilds the layout. |
| `removeSlide(index)` | `void` | Removes a logical slide and keeps the remaining index valid. |
| `update(options)` | `void` | Updates layout and behavior while retaining unchanged content. `plugins` and `startIndex` are rejected. |
| `on(event, handler)` | unsubscribe function | Subscribes to an event. |
| `off(event, handler)` | `void` | Removes the exact handler. |
| `once(event, handler)` | unsubscribe function | Subscribes for one emission. |
| `destroy()` | `void` | Cancels animations, destroys plugins, removes generated DOM and listeners. |

Do not call methods after `destroy()`. Create a new instance if the host needs to mount the carousel again.

### Changing slides without remounting

```js
// Give slides stable ids when the application produces new data objects.
const slides = [
  { id: 'forest', content: renderForest, meta: { title: 'Forest' } },
  { id: 'coast', content: renderCoast, meta: { title: 'Coast' } },
]
const carousel = new Carousel('#gallery', slides, { loop: true })

carousel.updateSlide(0, { meta: { title: 'Updated title' } }) // retains content
carousel.updateSlide(1, { content: renderNewCoast })          // replaces only coast
carousel.moveSlide(0, 1)                                    // final order: coast, forest
carousel.setSlides(carousel.getSlides().reverse().map(slide => ({ ...slide })))
carousel.update({ gap: 24 })                                // retains content
carousel.refresh(carousel.getIndex())                       // resets selected content
```

`renderForest`, `renderCoast` and `renderNewCoast` above are application functions returning an `HTMLElement`. For a retained identity, `setSlides()` keeps content when its `content` value/reference is unchanged. New inline render functions count as changed content, even if they produce the same markup. Metadata-only patches preserve input values and listeners; `meta` is replaced as a whole, not recursively merged. Supplying `content` to `updateSlide()` deliberately refreshes that slide, even if its value/reference is unchanged. Use mutations rather than editing objects returned by getters; the returned array is copied, its slide objects are not deep-cloned.

Ids cannot be changed by `updateSlide()`. Use `setSlides()` to replace an identity. Duplicate or invalid ids reject the mutation. `updateSlide()`, `moveSlide()` and indexed `refresh()` require existing non-negative integer indices and throw `RangeError` otherwise. `moveSlide()` uses the final index after removal and does nothing when both indices match. `addSlide()` appends by default; a supplied integer is clamped to `0…count`. `removeSlide()` ignores invalid indices.

Reordering and reconciliation retain the selected identity when possible. Removing it selects the item at the previous index, clamped to the available range and finite navigation bounds. `setSlides([])` is supported, and slides can be added afterward. Mutations cancel an active transition, rebuild synchronously and emit `slides:change`; observe that event for collection changes rather than expecting `slide:change` navigation events. Original wrapper elements are reused for retained identities; content replacement or `refresh()` intentionally replaces their descendants. Where available, native atomic DOM moves also retain browser-managed state during reordering.

## Events

| Event | Payload |
| --- | --- |
| `slides:change` | `{ type, previousCount, count, index }`; `type` is `'add'`, `'remove'`, `'update'`, `'move'`, `'set'` or `'refresh'`. |
| `render` | `CarouselRenderState`; shared core frame for position-driven effects. |
| `render:reset` | No payload; discard cached content/geometry before a rebuild. |
| `layout:error` / `effect:error` | `{ name, error }`; failed custom layout or content effect. |
| `slide:beforeChange` | `{ fromIndex, toIndex }` |
| `slide:change` | `{ index, prevIndex, slide }` |
| `transition:start` | `{ fromIndex, toIndex }` |
| `transition:end` | `{ index }` |
| `transition:error` | `{ name, error }` |
| `resize` | `{ slidesPerView }` |
| `autoplay:start` / `autoplay:stop` | no payload |
| `autoplay:state` | `{ available, active, paused, running, interval, remaining, progress }`; emitted on state changes, not every frame. |
| `slide:lazyload` | `{ index, element }` |
| `slide:error` | `{ index, error }` |
| `destroy` | no payload |

Rendering and lazy-load failures are isolated to the affected slide. After construction they are reported through `slide:error`. Initial synchronous render failures are logged to the console because a consumer cannot subscribe until the constructor returns.

## Built-in plugins

- [Arrows](src/plugins/arrows/README.md) — previous and next buttons; edge hiding is enabled by default, hover reveal is opt-in.
- [Dots](src/plugins/dots/README.md) — clickable pagination.
- [Thumbnails](src/plugins/thumbnails/README.md) — bottom or side thumbnail navigation.
- [Keyboard](src/plugins/keyboard/README.md) — focus-scoped arrow keys by default; document-wide handling is opt-in.
- [Swipe](src/plugins/swipe/README.md) — touch, pointer, resistance, and optional mouse drag.
- [Autoplay](src/plugins/autoplay/README.md) — interval playback with hover and interaction pausing.
- [Controls](src/plugins/controls/README.md) — optional Play/Pause, circular or bar time progress, and slide counter.
- [Lazy load](src/plugins/lazyload/README.md) — observer-based image loading and configurable preloading.
- [Parallax](src/plugins/parallax/README.md) — position-driven visual offset.

Use `createArrows({ hideOnIdle: true })` to slide arrows out towards their respective edges when the pointer leaves the slide viewport. Hover or visible keyboard focus reveals them again. Controls stay visible on touch and mixed-input devices; reduced motion is respected. The default is `false`. [Try the hover-reveal demo](https://shelamkoff.github.io/carousel/#hover-arrows-example).

Tabbing or focusing a control in an off-screen slide brings that slide into view immediately, keeping the logical index, native scroll and rendered position synchronized. Live inputs, values, listeners and Shadow DOM are preserved. Focusing an already-visible control keeps the current multi-slide page. This behavior is part of the core and does not require the keyboard plugin.

Install a plugin in `plugins` or with `use()`, and remove it with `unuse(plugin.name)`. Removal runs `destroy()`, unsubscribes owned callbacks and revokes the retired context's mutation commands, so queued callbacks cannot keep controlling the carousel. A removed instance can be installed again. A stateful plugin instance may belong to only one live carousel; create a fresh plugin object for every concurrent carousel.

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
      context.on('slides:change', render)
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

The frozen context exposes owned event subscriptions, navigation and collection commands, read-only state and resolved options, live DOM getters, position methods for gesture/effect plugins, `getRenderState()` and `refreshLayout()`. `getPlugin(name)` returns an already installed optional plugin or `undefined`. Context subscriptions are removed automatically. The plugin must still release its own DOM, global listeners, observers, timers, animation frames, object URLs, and third-party instances in `destroy()`.

If `install()` throws, the carousel rolls back context subscriptions and invokes the plugin cleanup. Make `destroy()` safe after partial installation.

## Verification

Run `npm ci` for the locked development dependencies, then `npm run check` to execute the Node regression suite, check the public TypeScript API, and rebuild the ESM package and local demo dependency. GitHub Actions checks Node 20.19, 22 and 24, and rejects an out-of-date committed distribution. The committed `dist` also supports Git installs with lifecycle scripts disabled.

Run `npx playwright install chromium` once, then `npm run test:browser` for Chromium integration tests of navigation, forms, same-origin iframes, live examples and lifecycle cleanup. To use an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. The diagnostic page is available at `/tests/browser/lifecycle.html` with `npm run demo`.

## Security boundary

String `slide.content` and custom arrow HTML are inserted as HTML. They must contain trusted developer-controlled markup. For user-controlled content, build an element with `textContent` or sanitize the value before passing it to the carousel.

## Demo

[Open the live demo](https://shelamkoff.github.io/carousel/) to try responsive horizontal/vertical layouts, fractional `1.15` / `2.25` views, themed playback controls, time progress, slide counters, autoplay, fade, thumbnails, parallax, custom themes, hover-reveal arrows, fixed scroll steps, auto-height media, dynamic collections, lazy rendering, all 12 cover transitions and an application-defined iris transition. The demo's JavaScript and illustrations are served locally; no third-party CDN is needed at runtime.

The [Slide API playground](https://shelamkoff.github.io/carousel/demo-assets/api.html) demonstrates targeted content and metadata updates, keyed immutable collection replacement, reordering, explicit refresh, custom geometry and removable caption/focus/parallax effects. Type in a card to inspect state preservation while changing the collection and layout.

GitHub Pages is published by `.github/workflows/pages.yml` on pushes to `master`, the configured Pages source branch. The workflow tests and builds the project, then stages only `index.html`, runtime JavaScript, CSS and demo assets through `scripts/build-pages.mjs`. It deploys a static artifact without Jekyll. `/version.json` records the deployed commit SHA. Generated staging directories live outside the repository.

The repository also has GitHub's automatic branch Pages workflow. Before publishing the staged demo, `scripts/wait-for-branch-pages.mjs` waits for that workflow to finish for the same commit, then checks that `master` still points to this version. This prevents the automatic branch deployment from overwriting the clean demo artifact and skips obsolete queued versions. A missing run or API failure stops publication with a bounded timeout instead of silently racing another deployment. If changing Pages from a branch source to GitHub Actions in repository settings, update this gate alongside that change.

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

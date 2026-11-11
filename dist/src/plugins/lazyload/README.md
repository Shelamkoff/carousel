# Carousel: Lazy load

```js
import { createLazyLoad } from '@shelamkoff/carousel'
const plugin = createLazyLoad({ rootMargin: '200px', threshold: 0, preload: 1 })
```

Defers rendering slides marked with `lazy: true`, observes the carousel viewport, and preloads `preload` adjacent slides on each side. Defaults are `rootMargin: '200px'`, `threshold: 0`, and `preload: 1`; the margin must be a non-empty string, threshold must be `0..1`, and preload must be a non-negative integer. Successful renders emit `slide:lazyload`; a render exception emits `slide:error` and is not retried until the slide DOM is rebuilt. String slide content follows the carousel's trusted-HTML boundary.

A preload radius covering the entire carousel visits each slide only once. Increasing the radius beyond the slide count does not add repeated passes. Application callbacks may destroy the carousel during rendering or `slide:lazyload`; pending work then stops.

Before navigation starts, the destination's visible slides and adjacent preload range are rendered synchronously. Distant jumps and reveal effects therefore start with prepared content, including fractional final pages and wrapped loop pages.

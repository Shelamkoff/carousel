# Carousel: Swipe

```js
import { createSwipe } from '@shelamkoff/carousel'
const plugin = createSwipe({ threshold: 50, resistance: 0.3, mouse: false })
```

Provides position-first pointer dragging, direction detection, edge resistance, snap-back, and page-aware navigation. Touch/pen input is enabled by default; mouse dragging requires `mouse: true`, and secondary touch pointers do not steal an active swipe. Window listeners are owned by an `AbortController` and released on plugin destroy. `threshold` is non-negative, `resistance` is `0..1`, and `mouse` must be boolean.

# Carousel: Parallax

```js
import { createParallax } from '@shelamkoff/carousel'
const plugin = createParallax({ factor: 0.2 })
```

Wraps slide content in parallax layers and consumes numeric core `render` frames for transitions and dragging. It does not run a private animation loop or parse CSS transforms. The finite `factor` defaults to `0.2` and is clamped to `0..1`. Native atomic moves preserve content state where supported; removal restores the original structure. Reduced motion disables displacement.

Lazy content synchronizes through the same core render notification. Rebuilds retire and recreate wrappers without a private timer or idle polling.

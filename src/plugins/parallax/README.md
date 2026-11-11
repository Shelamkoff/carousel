# Carousel: Parallax

```js
import { createParallax } from '@shelamkoff/carousel'
const plugin = createParallax({ factor: 0.2 })
```

Wraps slide content in parallax layers and follows transitions and pointer dragging with `requestAnimationFrame`. The finite `factor` defaults to `0.2` and is clamped to `0..1`. Wrappers, listeners, and animation frames are removed during plugin cleanup.

Lazy rendering shares the active animation clock. A layout rebuild that cancels a transition also stops the effect's frame loop, so the plugin does not keep scheduling frames while idle.

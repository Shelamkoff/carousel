# Carousel: swipe

```js
import { createSwipe } from '@shelamkoff/carousel'
const plugin = createSwipe({ threshold: 50, resistance: 0.3, mouse: false })
```

Реализует pointer drag, направление, сопротивление края, snap-back и навигацию по страницам. Touch/pen включены; mouse требует `mouse: true`. AbortController освобождает window обработчики событий.

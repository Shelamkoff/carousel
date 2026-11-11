# Carousel: Autoplay

```js
import { createAutoplay } from '@shelamkoff/carousel'
const autoplay = createAutoplay({ interval: 3000, pauseOnHover: true, pauseOnInteraction: true })
```

Starts automatically when installed, schedules the first advance after `interval`, then schedules subsequent advances after completed transitions instead of running an overlapping interval. It stops at the final non-loop page or when there is at most one slide. With `pauseOnInteraction: true`, any non-autoplay API/navigation change stops it; hover pause is enabled by default. The returned plugin exposes `start()`, `stop()`, `toggle()`, and `isActive()`. `interval` must be positive and pause options must be booleans.

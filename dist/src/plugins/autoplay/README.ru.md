# Carousel: autoplay

```js
import { createAutoplay } from '@shelamkoff/carousel'
const autoplay = createAutoplay({ interval: 3000, pauseOnHover: true, pauseOnInteraction: true })
```

Запускается после установки, ждёт завершения transition перед следующим timeout и не создаёт перекрывающиеся интервалы. Останавливается на последней non-loop странице, при одном слайде и при interaction, если включён `pauseOnInteraction`. API: `start`, `stop`, `toggle`, `isActive`.

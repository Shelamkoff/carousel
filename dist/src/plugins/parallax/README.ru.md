# Carousel: parallax

```js
import { createParallax } from '@shelamkoff/carousel'
const plugin = createParallax({ factor: 0.2 })
```

Оборачивает содержимое в parallax layers и синхронизирует transition и drag через `requestAnimationFrame`. `factor` ограничивается диапазоном `0..1`; освобождение ресурсов удаляет wrappers, обработчики событий и frames.

Ленивая загрузка использует уже работающий цикл анимации. Перестроение, отменившее переход, останавливает и анимацию эффекта: в покое плагин не запрашивает новые кадры.

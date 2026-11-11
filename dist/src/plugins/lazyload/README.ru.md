# Carousel: lazy load

```js
import { createLazyLoad } from '@shelamkoff/carousel'
const plugin = createLazyLoad({ rootMargin: '200px', threshold: 0, preload: 1 })
```

Откладывает render слайдов с `lazy: true`, наблюдает viewport и заранее загружает соседей. Проверяет rootMargin, threshold `0..1` и неотрицательный preload. Успех создаёт `slide:lazyload`, ошибка — `slide:error`.

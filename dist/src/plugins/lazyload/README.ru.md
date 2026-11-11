# Carousel: lazy load

```js
import { createLazyLoad } from '@shelamkoff/carousel'
const plugin = createLazyLoad({ rootMargin: '200px', threshold: 0, preload: 1 })
```

Откладывает render слайдов с `lazy: true`, наблюдает viewport и заранее загружает соседей. Проверяет rootMargin, threshold `0..1` и неотрицательный preload. Успех создаёт `slide:lazyload`, ошибка — `slide:error`.

Если радиус загрузки охватывает всю карусель, каждый слайд обходится только один раз. Большое значение `preload` не создаёт повторных проходов. Уничтожение карусели из функции рендера или обработчика `slide:lazyload` останавливает оставшуюся работу.

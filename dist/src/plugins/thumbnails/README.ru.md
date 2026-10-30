# Carousel: миниатюры

```js
import { createThumbnails } from '@shelamkoff/carousel'
const plugin = createThumbnails({ width: 60, height: 40, position: 'bottom' })
```

Создаёт доступную кнопку для каждого `slide.thumb`, отмечает активную `aria-current="page"`. Position: `bottom`, `left`, `right`; размеры должны быть положительными.

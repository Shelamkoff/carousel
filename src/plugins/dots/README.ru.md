# Carousel: точки

```js
import { createDots } from '@shelamkoff/carousel'
const plugin = createDots({ clickable: true })
```

Строит pagination по `slidesPerView` и `slidesPerScroll`, отмечает активную страницу `aria-current="page"` и перестраивается при responsive changes. `clickable: false` создаёт нефокусируемые indicators.

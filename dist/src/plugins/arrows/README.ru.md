# Carousel: стрелки

```js
import { createArrows } from '@shelamkoff/carousel'
const plugin = createArrows({ hideOnEdge: true, prevHTML, nextHTML })
```

Добавляет доступные кнопки назад/вперёд и обновляет видимость на краях после навигации и responsive changes. `hideOnEdge` по умолчанию `true`. HTML кнопок считается доверенной конфигурацией; недоверенные данные очищайте заранее.

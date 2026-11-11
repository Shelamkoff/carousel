# Carousel: стрелки

```js
import { createArrows } from '@shelamkoff/carousel'
const plugin = createArrows({ hideOnEdge: true, prevHTML, nextHTML })
```

Добавляет доступные кнопки назад/вперёд и обновляет видимость на краях после навигации и responsive changes. `hideOnEdge` по умолчанию `true`. HTML кнопок считается доверенной конфигурацией; недоверенные данные очищайте заранее.

Встроенные SVG-иконки имеют класс `carousel__arrow-icon`. При подключённом CSS карусели переменная `--carousel-arrow-icon-size` на карусели или её предке задаёт ширину и высоту иконок (по умолчанию 24px). Пользовательские `prevHTML` и `nextHTML` вставляются без изменений: стилизуйте их своими селекторами или добавьте тот же класс.

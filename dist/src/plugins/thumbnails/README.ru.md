# Carousel: миниатюры

```js
import { createThumbnails } from '@shelamkoff/carousel'
const plugin = createThumbnails({ width: 60, height: 40, position: 'bottom' })
```

Создаёт доступную кнопку для каждого `slide.thumb`, отмечает активную `aria-current="page"`. Position: `bottom`, `left`, `right`; размеры должны быть положительными.

Задайте `--carousel-thumb-width` и `--carousel-thumb-height` на карусели или её предке, чтобы управлять размерами миниатюр через CSS, в том числе в медиазапросах. Значения CSS имеют приоритет над числовыми параметрами `width` и `height`. Если переменная не задана, соответствующий параметр задаёт размер в пикселях (по умолчанию 60 и 40).

```css
.gallery {
  --carousel-thumb-width: 84px;
  --carousel-thumb-height: 56px;
}

@media (max-width: 600px) {
  .gallery {
    --carousel-thumb-width: 60px;
    --carousel-thumb-height: 40px;
  }
}
```

# Carousel: Thumbnails

```js
import { createThumbnails } from '@shelamkoff/carousel'
const plugin = createThumbnails({ width: 60, height: 40, position: 'bottom' })
```

Creates one accessible thumbnail button per slide using `slide.thumb` as an image URL and marks the active button with `aria-current="page"`. `position` defaults to `bottom` and accepts `bottom`, `left`, or `right`; width and height must be positive finite numbers. DOM and left/right orientation classes are removed during plugin cleanup.

Set `--carousel-thumb-width` and `--carousel-thumb-height` on the carousel or an ancestor to size thumbnails with CSS, including media queries. These CSS values take precedence over the numeric `width` and `height` options. When a variable is unset, its corresponding option provides the pixel fallback (60 and 40 by default).

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

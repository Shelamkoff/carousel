# Carousel: Thumbnails

```js
import { createThumbnails } from '@shelamkoff/carousel'
const plugin = createThumbnails({ width: 60, height: 40, position: 'bottom' })
```

Creates one accessible thumbnail button per slide using `slide.thumb` as an image URL and marks the active button with `aria-current="page"`. `position` defaults to `bottom` and accepts `bottom`, `left`, or `right`; width and height must be positive finite numbers. DOM and left/right orientation classes are removed during plugin cleanup.

# Carousel: Arrows

```js
import { createArrows } from '@shelamkoff/carousel'
const plugin = createArrows({ hideOnEdge: true, prevHTML, nextHTML })
```

Adds accessible previous/next buttons and updates edge visibility after slide and responsive changes. `hideOnEdge` defaults to `true`; all three options are type-checked. `prevHTML` and `nextHTML` are trusted developer markup; sanitize untrusted content before passing it. Install through `plugins` or `carousel.use(plugin)` while that plugin instance is not owned by another carousel.

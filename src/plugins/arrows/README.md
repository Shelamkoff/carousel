# Carousel: Arrows

```js
import { createArrows } from '@shelamkoff/carousel'
const plugin = createArrows({ hideOnEdge: true, prevHTML, nextHTML })
```

Adds accessible previous/next buttons and updates edge visibility after slide and responsive changes. `hideOnEdge` defaults to `true`; all three options are type-checked. `prevHTML` and `nextHTML` are trusted developer markup; sanitize untrusted content before passing it. Install through `plugins` or `carousel.use(plugin)` while that plugin instance is not owned by another carousel.

The built-in SVG icons have the `carousel__arrow-icon` class. With the carousel stylesheet, set `--carousel-arrow-icon-size` on the carousel or an ancestor to change both icon dimensions (24px by default). Custom `prevHTML` and `nextHTML` are inserted unchanged; style that markup with your own selectors or opt into the same class.

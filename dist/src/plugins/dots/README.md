# Carousel: Dots

```js
import { createDots } from '@shelamkoff/carousel'
const plugin = createDots({ clickable: true })
```

Builds page-oriented pagination from `slidesPerView` and `slidesPerScroll`, marks the active item with `aria-current="page"`, and rebuilds on responsive layout changes. `clickable` defaults to `true`; `false` produces non-focusable indicator elements rather than inert buttons.

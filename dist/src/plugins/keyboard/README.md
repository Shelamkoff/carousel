# Carousel: Keyboard

```js
import { createKeyboard } from '@shelamkoff/carousel'
const plugin = createKeyboard({ scope: 'container' })
```

Handles Arrow Left/Right horizontally, Arrow Up/Down vertically, and Home/End in both orientations, while ignoring editable controls. The default `container` scope makes the carousel root focusable and prevents multiple instances from reacting together. `document` scope remains available as an explicit opt-in and responds only when focus is in that carousel or on the page body. Nested carousels own their keys, including orthogonal arrows they leave unhandled.

Already handled events, text composition, and Alt/Ctrl/Meta shortcuts retain their existing behavior. The listener uses the carousel's owning document, including when the carousel is mounted in a same-origin iframe.

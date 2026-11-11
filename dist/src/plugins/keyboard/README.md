# Carousel: Keyboard

```js
import { createKeyboard } from '@shelamkoff/carousel'
const plugin = createKeyboard({ scope: 'container' })
```

Handles Arrow Left/Right, Home, and End while ignoring editable controls. The default `container` scope makes the carousel root focusable and prevents multiple instances from reacting together. `document` scope remains available as an explicit opt-in and responds only when focus is in that carousel or on the page body.

# Carousel: клавиатура

```js
import { createKeyboard } from '@shelamkoff/carousel'
const plugin = createKeyboard({ scope: 'container' })
```

Обрабатывает Arrow Left/Right, Home и End, игнорируя editable controls. Scope `container` изолирует экземпляры; `document` включается явно и реагирует только на подходящий focus.

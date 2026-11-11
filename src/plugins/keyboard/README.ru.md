# Carousel: клавиатура

```js
import { createKeyboard } from '@shelamkoff/carousel'
const plugin = createKeyboard({ scope: 'container' })
```

Обрабатывает Arrow Left/Right, Home и End, игнорируя editable controls. Scope `container` изолирует экземпляры; `document` включается явно и реагирует только на подходящий focus.

Уже обработанные события, ввод через IME и сочетания с Alt/Ctrl/Meta сохраняют своё поведение. Обработчик использует документ карусели, в том числе при размещении внутри iframe того же источника.

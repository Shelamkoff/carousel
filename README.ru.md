# @shelamkoff/carousel

Независимая от фреймворков карусель, в которой основой состояния является позиция. Core управляет размещением слайдов, loop-математикой, адаптивной перестройкой, отменой анимаций, событиями и lifecycle плагинов.

[English README](./README.md)

## Установка

```bash
npm install @shelamkoff/carousel @shelamkoff/event-bus
```

```js
import { Carousel, createArrows, createKeyboard, createSwipe } from '@shelamkoff/carousel'
import '@shelamkoff/carousel/styles.css'

const carousel = new Carousel(document.querySelector('#carousel'), [
  { content: () => Object.assign(document.createElement('img'), { src: '/photo.jpg', alt: '' }), thumb: '/thumb-1.jpg' },
  { content: '<p>Доверенный HTML приложения</p>' },
], {
  loop: true,
  gap: 16,
  plugins: [createArrows(), createKeyboard(), createSwipe({ mouse: true })],
})

carousel.next()
carousel.update({ slidesPerView: 2, breakpoints: { 900: { slidesPerView: 3 } } })
carousel.destroy()
```

`carouselStylesUrl` содержит URL package CSS. Клавиатура по умолчанию ограничена фокусируемым контейнером; `{ scope: 'document' }` включается явно.

## Плагины

- [Стрелки](./src/plugins/arrows/README.ru.md)
- [Точки](./src/plugins/dots/README.ru.md)
- [Миниатюры](./src/plugins/thumbnails/README.ru.md)
- [Клавиатура](./src/plugins/keyboard/README.ru.md)
- [Swipe](./src/plugins/swipe/README.ru.md)
- [Autoplay](./src/plugins/autoplay/README.ru.md)
- [Lazy load](./src/plugins/lazyload/README.ru.md)
- [Parallax](./src/plugins/parallax/README.ru.md)

При ошибке установки карусель вызывает `plugin.destroy()` и удаляет принадлежащие context подписки. `update()` меняет layout/behavior, но намеренно отклоняет `plugins`. Один stateful-экземпляр плагина может принадлежать только одной активной карусели. Ошибка рендера изолируется одним слайдом и создаёт `slide:error`.

## Создание плагина

Плагин содержит уникальный `name`, `install(context)` и необязательный `destroy()`. Factory должен возвращать отдельное состояние для каждой карусели.

```js
export function createProgressPlugin() {
  let element = null
  return {
    name: 'progress',
    install(context) {
      element = document.createElement('output')
      element.className = 'carousel-progress'
      element.setAttribute('aria-live', 'polite')
      const render = () => {
        element.textContent = `${context.getRealIndex() + 1} / ${context.getSlideCount()}`
      }
      context.getRoot()?.appendChild(element)
      context.on('slide:change', render)
      context.on('resize', render)
      render()
    },
    destroy() {
      element?.remove()
      element = null
    },
  }
}
```

Context предоставляет принадлежащие владельцу `on`, `once`, `emit`, команды навигации и snap-back, read-only снимки слайдов/options, индексы, loop/layout-запросы, DOM-getters и `refreshLayout()`. Подписки context очищаются автоматически; DOM, глобальные listeners, observers, timers, frames, object URLs и внешние экземпляры освобождает сам плагин.

Строковый `slide.content` и HTML стрелок считаются доверенной конфигурацией разработчика. Для недоверенных данных используйте `HTMLElement`, render-функцию или предварительную sanitization.

Пакет `1.0.0` распространяется как ESM, зависит от `@shelamkoff/event-bus` и использует лицензию MIT.

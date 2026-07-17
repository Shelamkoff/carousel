# @shelamkoff/carousel

Независимая от UI-фреймворков карусель с позиционной моделью, адаптивной раскладкой, зацикливанием, отменяемыми переходами, типизированными событиями и подключаемыми плагинами. Версия `1.0.0` поставляется как ESM-пакет для современных браузеров.

[English README](./README.md)

## Установка

```bash
npm install @shelamkoff/carousel @shelamkoff/event-bus
```

Один раз подключите обязательные стили:

```js
import '@shelamkoff/carousel/styles.css'
```

Экспорт `carouselStylesUrl` позволяет приложению самостоятельно создать элемент `<link>`.

## Быстрый старт

```html
<div id="gallery"></div>
```

```js
import {
  Carousel,
  createArrows,
  createDots,
  createKeyboard,
  createSwipe,
} from '@shelamkoff/carousel'
import '@shelamkoff/carousel/styles.css'

const carousel = new Carousel('#gallery', [
  {
    content: () => Object.assign(document.createElement('img'), {
      src: '/photos/forest.jpg',
      alt: 'Лес',
    }),
    thumb: '/photos/forest-thumb.jpg',
  },
  { content: '<p>Доверенная разметка приложения</p>' },
], {
  loop: true,
  gap: 16,
  plugins: [
    createArrows(),
    createDots(),
    createKeyboard(),
    createSwipe({ mouse: true }),
  ],
})

const unsubscribe = carousel.on('slide:change', ({ index, slide }) => {
  console.log(index, slide.meta)
})

carousel.next()

// При освобождении ресурсов:
unsubscribe()
carousel.destroy()
```

Контейнером может быть `HTMLElement` или CSS-селектор. Если селектор не находит элемент, конструктор выбрасывает исключение.

## Данные слайда

```ts
interface SlideData {
  content: string | HTMLElement | (() => HTMLElement)
  thumb?: string
  lazy?: boolean
  meta?: Record<string, unknown>
}
```

- Функция рендеринга — предпочтительный вариант для динамических или недоверенных данных.
- Переданный `HTMLElement` перемещается в карусель, а не клонируется.
- Строка интерпретируется как HTML и считается доверенной конфигурацией разработчика.
- `thumb` использует плагин миниатюр, `lazy` — ленивая загрузка, а `meta` остаётся метаданными приложения.

## Конфигурация

| Поле | Тип | По умолчанию | Назначение |
| --- | --- | --- | --- |
| `slidesPerView` | `number` | `1` | Количество одновременно видимых слайдов. Значение должно быть положительным. |
| `slidesPerScroll` | `number \| 'auto'` | `1` | Шаг навигации. `'auto'` использует текущее количество видимых слайдов. |
| `gap` | `number` | `0` | Расстояние между слайдами в CSS-пикселях. |
| `transition` | `'slide' \| 'fade'` | `'slide'` | Способ перехода. В режиме `fade` одновременно отображается один слайд. |
| `transitionDuration` | `number` | `400` | Длительность перехода в миллисекундах. |
| `loop` | `boolean` | `false` | Включает циклическую навигацию с техническими клонами. |
| `startIndex` | `number` | `0` | Начальный логический индекс. Используется только при создании. |
| `breakpoints` | `Record<number, Partial<CarouselResponsiveOptions>>` | нет | Переопределения, действующие начиная с указанной ширины области просмотра. |
| `plugins` | `CarouselPlugin[]` | `[]` | Плагины, устанавливаемые при создании. |

Настройки контрольной точки переопределяют базовые. При смене контрольной точки карусель сохраняет текущий логический слайд, отменяет устаревшую анимацию и перестраивает раскладку.

```js
const carousel = new Carousel('#gallery', slides, {
  slidesPerView: 1,
  slidesPerScroll: 'auto',
  breakpoints: {
    640: { slidesPerView: 2, gap: 12 },
    1024: { slidesPerView: 4, gap: 20 },
  },
})
```

## Публичный API

| Метод | Результат | Назначение |
| --- | --- | --- |
| `use(plugin)` | `this` | Устанавливает плагин. Имена плагинов должны быть уникальны. |
| `getPlugin(name)` | плагин или `undefined` | Возвращает публичный объект установленного плагина. |
| `next()` / `prev()` | `void` | Перемещает карусель на текущий шаг прокрутки. |
| `goTo(index)` | `void` | Переходит к логическому индексу слайда. |
| `getIndex()` | `number` | Возвращает внутренний индекс отрисовки. В циклическом режиме обычно нужен `getRealIndex()`. |
| `getRealIndex()` | `number` | Возвращает логический индекс в исходном массиве. |
| `getSlide(index?)` | слайд или `null` | Возвращает слайд; без индекса — текущий. |
| `getSlides()` | `SlideData[]` | Возвращает защитную копию массива слайдов. |
| `addSlide(slide, index?)` | `void` | Добавляет слайд и перестраивает раскладку. |
| `removeSlide(index)` | `void` | Удаляет логический слайд и корректирует текущий индекс. |
| `update(options)` | `void` | Меняет поведение и раскладку. Поля `plugins` и `startIndex` намеренно не принимаются. |
| `on(event, handler)` | функция отписки | Подписывает обработчик на событие. |
| `off(event, handler)` | `void` | Удаляет конкретный обработчик. |
| `once(event, handler)` | функция отписки | Подписывает обработчик на одно срабатывание. |
| `destroy()` | `void` | Отменяет анимации, уничтожает плагины, удаляет созданный DOM и обработчики. |

После `destroy()` экземпляр использовать нельзя. Для повторного монтирования создайте новую карусель.

## События

| Событие | Данные |
| --- | --- |
| `slide:beforeChange` | `{ fromIndex, toIndex }` |
| `slide:change` | `{ index, prevIndex, slide }` |
| `transition:start` | `{ fromIndex, toIndex }` |
| `transition:end` | `{ index }` |
| `resize` | `{ slidesPerView }` |
| `autoplay:start` / `autoplay:stop` | без данных |
| `slide:lazyload` | `{ index, element }` |
| `slide:error` | `{ index, error }` |
| `destroy` | без данных |

Ошибка отрисовки или ленивой загрузки изолируется в соответствующем слайде и передаётся через `slide:error`.

## Встроенные плагины

- [Стрелки](dist/src/plugins/arrows/README.ru.md) — кнопки перехода; на границах скрываются по умолчанию.
- [Точки](dist/src/plugins/dots/README.ru.md) — нажимаемая пагинация.
- [Миниатюры](dist/src/plugins/thumbnails/README.ru.md) — нижняя или боковая навигация.
- [Клавиатура](dist/src/plugins/keyboard/README.ru.md) — по умолчанию обрабатывает клавиши только внутри карусели.
- [Жесты](dist/src/plugins/swipe/README.ru.md) — сенсорный ввод, указатель, сопротивление и необязательное перетаскивание мышью.
- [Автовоспроизведение](dist/src/plugins/autoplay/README.ru.md) — интервальное переключение с паузой при наведении и взаимодействии.
- [Ленивая загрузка](dist/src/plugins/lazyload/README.ru.md) — загрузка изображений через `IntersectionObserver` и предварительная подгрузка.
- [Параллакс](dist/src/plugins/parallax/README.ru.md) — визуальное смещение, зависящее от позиции.

Плагин подключается через `plugins` или `use()`. Один экземпляр плагина с состоянием может принадлежать только одной активной карусели; для нескольких каруселей создавайте отдельные объекты.

## Создание плагина

Плагин содержит уникальное поле `name`, метод `install(context)` и необязательный `destroy()`:

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

      context.getRoot()?.append(element)
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

Замороженный контекст предоставляет подписки на события с автоматическим владением, команды навигации, состояние и вычисленные настройки только для чтения, актуальные ссылки на DOM, позиционные методы для жестов и эффектов, а также `refreshLayout()`. Подписки контекста удаляются автоматически. Собственный DOM, глобальные обработчики, наблюдатели, таймеры, кадры анимации, объектные URL и сторонние экземпляры плагин освобождает в `destroy()`.

Если `install()` выбрасывает исключение, карусель откатывает подписки и вызывает очистку плагина. Поэтому `destroy()` должен быть безопасен и после частичной установки.

## Граница безопасности

Строковые `slide.content` и пользовательская HTML-разметка стрелок вставляются как HTML. Передавайте туда только доверенную разметку разработчика. Для пользовательских данных создавайте элемент через `textContent` или предварительно очищайте значение.

## Демо

Из каталога пакета:

```bash
npm install
npm run demo
```

Или из корня рабочего пространства:

```bash
npm run demo:carousel
```

Откройте `http://127.0.0.1:4173/carousel/demo.html`. Страница проверяет основную навигацию, адаптивный многоэлементный режим, зацикливание и автовоспроизведение, затухание, миниатюры, пользовательскую тему и фиксированный шаг.

## Экспорты пакета

- `@shelamkoff/carousel` — JavaScript API и объявления TypeScript.
- `@shelamkoff/carousel/styles.css` — обязательные стили карусели.
- `@shelamkoff/carousel/package.json` — метаданные пакета.

## Лицензия

MIT.

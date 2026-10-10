# @shelamkoff/carousel

[![версия npm](https://img.shields.io/npm/v/%40shelamkoff%2Fcarousel)](https://www.npmjs.com/package/@shelamkoff/carousel)
[![Онлайн-демо](https://img.shields.io/badge/demo-live-4357b4)](https://shelamkoff.github.io/carousel/)
[![Лицензия MIT](https://img.shields.io/badge/license-MIT-2ea44f)](./LICENSE)

Независимая от UI-фреймворков карусель и слайдер с позиционной моделью, адаптивной раскладкой, зацикливанием, отменяемыми переходами, типизированными событиями, сенсорными жестами, доступностью и подключаемыми плагинами. Поставляется как ESM-пакет для современных браузеров.

[Онлайн-демо](https://shelamkoff.github.io/carousel/) · [npm](https://www.npmjs.com/package/@shelamkoff/carousel) · [English README](./README.md)

## Возможности

- Адаптивная раскладка с одним или несколькими слайдами и фиксированным либо автоматическим шагом.
- Зацикливание, отменяемые переходы, клавиатура, сенсорные жесты и перетаскивание мышью.
- Плагины стрелок, точек, миниатюр, автопоказа, ленивой загрузки, жестов и параллакса.
- Независимый от фреймворков жизненный цикл, типизированные события и объявления TypeScript.

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
- Переданный `HTMLElement` **клонируется** через `cloneNode(true)`. Обработчики, зарегистрированные на оригинальном элементе через `addEventListener`, не копируются. Для интерактивного содержимого используйте функцию рендеринга.
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
| `loop` | `boolean` | `false` | Циклическая навигация с позиционированием исходных слайдов. Только для коротких циклов создаются неинтерактивные визуальные копии. |
| `startIndex` | `number` | `0` | Начальный логический индекс. Используется только при создании. |
| `ariaLabel` | `string` | `'Carousel'` | Доступное имя области карусели для вспомогательных технологий. |
| `breakpoints` | `Record<number, Partial<CarouselResponsiveOptions>>` | нет | Переопределения, действующие начиная с указанной ширины области просмотра. |
| `plugins` | `CarouselPlugin[]` | `[]` | Плагины, устанавливаемые при создании. |

Настройки контрольной точки переопределяют базовые. При смене контрольной точки и добавлении или удалении соседних слайдов сохраняются существующие DOM-узлы. Явный вызов `update()` повторно рендерит содержимое (включая функции рендеринга) и может заменить вложенные DOM-элементы. При `prefers-reduced-motion: reduce` анимации отключаются.

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
| `getIndex()` | `number` | Возвращает текущий логический индекс, в том числе в циклическом режиме. |
| `getRealIndex()` | `number` | Алиас `getIndex()`, сохранённый для интеграций. |
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

Ошибки отрисовки и ленивой загрузки изолируются. После создания карусели они передаются через `slide:error`. Синхронные ошибки первоначального рендеринга выводятся в консоль, поскольку подписаться на событие до завершения конструктора нельзя.

## Встроенные плагины

- [Стрелки](src/plugins/arrows/README.ru.md) — кнопки перехода; на границах скрываются по умолчанию.
- [Точки](src/plugins/dots/README.ru.md) — нажимаемая пагинация.
- [Миниатюры](src/plugins/thumbnails/README.ru.md) — нижняя или боковая навигация.
- [Клавиатура](src/plugins/keyboard/README.ru.md) — по умолчанию обрабатывает клавиши только внутри карусели.
- [Жесты](src/plugins/swipe/README.ru.md) — сенсорный ввод, указатель, сопротивление и необязательное перетаскивание мышью.
- [Автовоспроизведение](src/plugins/autoplay/README.ru.md) — интервальное переключение с паузой при наведении и взаимодействии.
- [Ленивая загрузка](src/plugins/lazyload/README.ru.md) — загрузка изображений через `IntersectionObserver` и предварительная подгрузка.
- [Параллакс](src/plugins/parallax/README.ru.md) — визуальное смещение, зависящее от позиции.

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

## Проверка

`npm test` запускает регрессионные Node-тесты, `npm run typecheck` проверяет публичные типы TypeScript, `npm run build` создаёт структуру ESM-пакета. Отдельная браузерная страница с регрессионными сценариями доступна по адресу `/tests/browser/lifecycle.html` при запущенном `npm run demo` и установленных зависимостях. Она не входит в `npm test` и требует браузера.

## Граница безопасности

Строковые `slide.content` и пользовательская HTML-разметка стрелок вставляются как HTML. Передавайте туда только доверенную разметку разработчика. Для пользовательских данных создавайте элемент через `textContent` или предварительно очищайте значение.

## Демо

[Откройте онлайн-демо](https://shelamkoff.github.io/carousel/), чтобы проверить адаптивную раскладку, циклы с дробным количеством слайдов, автопоказ, затухание, миниатюры, параллакс, пользовательские темы и фиксированный шаг.

Для локального запуска той же страницы:

```bash
npm install
npm run demo
```

Откройте `http://127.0.0.1:4173/`.

## Экспорты пакета

- `@shelamkoff/carousel` — JavaScript API и объявления TypeScript.
- `@shelamkoff/carousel/styles.css` — обязательные стили карусели.
- `@shelamkoff/carousel/package.json` — метаданные пакета.

## Лицензия

MIT.

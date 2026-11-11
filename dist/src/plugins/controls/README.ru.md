# Carousel: элементы управления

`createControls()` создаёт кнопку Play/Pause, индикатор прошедшего времени и счётчик слайдов. Собственная HTML-разметка и дополнительные зависимости не нужны.

```js
import { Carousel, createAutoplay, createControls } from '@shelamkoff/carousel'

const controls = createControls({
  playPause: true,
  progress: 'circle',
  counter: true,
  position: 'below',
  labels: {
    play: 'Начать автопоказ',
    pause: 'Приостановить автопоказ',
    progress: 'Прошедшее время показа',
    counter: 'Слайд',
    controls: 'Управление галереей',
  },
  formatCounter: (current, total) => `${current}/${total}`,
})
new Carousel('#gallery', slides, {
  plugins: [createAutoplay({ interval: 4500 }), controls],
})
controls.update({ progress: 'bar', position: 'overlay' })
```

| Опция | По умолчанию | Назначение |
| --- | --- | --- |
| `playPause` | `true` | Кнопка при установленном автопоказе. |
| `progress` | `'circle'` | Круг, `'bar'` — полоска, `false` — скрыть. Без автопоказа скрыт. |
| `counter` | `true` | Номер выбранного исходного слайда / общее количество. Работает без автопоказа. |
| `position` | `'below'` | Под галереей либо `'overlay'` внутри неё. Вертикальный overlay располагается справа, не перекрывая стрелки сверху и снизу. |
| `labels` | Английские подписи | Доступные имена кнопки, прогресса, счётчика и всей группы. Можно переопределять частично. |
| `formatCounter` | `current / total` | Форматирование обычного текста. Пустая галерея — `0 / 0`; визуальные копии в loop не учитываются. Ошибки форматтера не прерывают навигацию. |

`update()` меняет эти параметры без пересоздания карусели. Все три опции видимости можно выключить независимо; если выключены все, скрывается группа. Отключение прогресса также останавливает его кадровый цикл. Порядок установки controls и autoplay не важен.

Счётчик обозначает выбранный слайд, а не страницу. В конечной галерее из 7 слайдов при `slidesPerView: 2.25` последняя позиция может показывать `6 / 7`, поскольку седьмой слайд уже находится рядом. Для страниц используется пагинация точками.

Прогресс получает время из того же deadline, что и автопереключение, замораживается на паузе и начинает новый интервал после перехода. Значение доступно через ARIA без постоянных голосовых объявлений. Подпись кнопки меняется между Play и Pause, иконка наследует `currentColor`.

## Темизация

Переменные задаются на контейнере или родительской теме; `update()` не нужен:

```css
.gallery {
  --carousel-controls-gap: 14px;
  --carousel-controls-bg: #171b24;
  --carousel-controls-color: #f0f3f9;
  --carousel-controls-padding: 10px 16px;
  --carousel-controls-radius: 12px;
  --carousel-play-size: 44px;
  --carousel-play-bg: #252d3b;
  --carousel-play-bg-hover: #364358;
  --carousel-play-color: #f0f3f9;
  --carousel-play-border: 1px solid #46536a;
  --carousel-progress-color: #9abaff;
  --carousel-progress-track: #46536a;
  --carousel-progress-size: 36px;
  --carousel-progress-stroke: 3;
  --carousel-counter-color: #f0f3f9;
  --carousel-counter-size: 14px;
}
```

Дополнительные переменные с тем же префиксом `--carousel-`: `controls-align`, `controls-border`, `controls-offset`, `play-icon-size`, `play-radius`, `play-color-hover`, `control-disabled-opacity`, `progress-width`, `progress-height`, `progress-radius`, `counter-weight`, а также общие переменные фокуса и длительности состояний controls. `--carousel-autoplay-progress` — вычисляемое внутреннее значение, не параметр темы.

Для собственного CSS доступны классы `.carousel__controls`, `.carousel__play-pause`, `.carousel__autoplay-progress`, `.carousel__progress-track`, `.carousel__progress-value`, `.carousel__counter`.

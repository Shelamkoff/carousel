# Carousel: Controls

Optional Play/Pause, elapsed display time and selected-slide counter. No dependencies or application-created markup are required.

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

| Option | Default | Meaning |
| --- | --- | --- |
| `playPause` | `true` | Show the playback button when autoplay is installed. |
| `progress` | `'circle'` | `'circle'`, `'bar'`, or `false`. Hidden without autoplay. |
| `counter` | `true` | Show the selected logical slide / source-slide count. Works without autoplay. |
| `position` | `'below'` | `'below'` the viewport or `'overlay'` inside it. Vertical overlays use the right side to avoid the top/bottom arrows. |
| `labels` | English labels | Accessible names for play, pause, progress, counter and the controls group. Partial updates retain other labels. |
| `formatCounter` | `current / total` | Plain-text formatter. Empty gallery is `0 / 0`; visual copies do not affect the total. Invalid or throwing results fall back to the default. |

`update()` changes any of these options without recreating the carousel. Set all three visibility options to `false` to hide the group. Disabling the time indicator also stops its animation-frame loop. Install the controls before or after autoplay; both orders work. If no autoplay plugin is installed, the counter remains available and the playback/time UI stays hidden.

The counter identifies the selected slide, not the number of navigation pages. For a finite 7-slide gallery showing 2.25 slides, the last selected index can display `6 / 7` while slide 7 is already visible. Use dots for page pagination.

The progress ring/bar shows elapsed display time from the autoplay controller's deadline, freezes on pause, and restarts for the next slide after its transition. Its ARIA value changes without a live announcement on every frame. The button's accessible label changes between Play and Pause; the current icon uses `currentColor`. There is no timer when autoplay is absent.

## Theme

Set custom properties on the host or an ancestor. No remount or `update()` is required:

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

Additional tokens: `controls-align`, `controls-border`, `controls-offset`, `play-icon-size`, `play-radius`, `play-color-hover`, `control-disabled-opacity`, `progress-width`, `progress-height`, `progress-radius`, `counter-weight`, and the shared focus/control-duration tokens. All use the `--carousel-` prefix. `--carousel-autoplay-progress` is an internal computed value, not a theme setting.

For custom styling, stable classes are `.carousel__controls`, `.carousel__play-pause`, `.carousel__autoplay-progress`, `.carousel__progress-track`, `.carousel__progress-value` and `.carousel__counter`.

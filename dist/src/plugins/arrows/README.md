# Carousel: Arrows

```js
import { createArrows } from '@shelamkoff/carousel'
const plugin = createArrows({ hideOnEdge: true, hideOnIdle: true })
```

Adds accessible previous/next buttons and updates edge visibility after slide and responsive changes. Install through `plugins` or `carousel.use(plugin)` while that plugin instance is not owned by another carousel.

| Option | Default | Behavior |
| --- | --- | --- |
| `hideOnEdge` | `true` | Hide the unavailable direction at the ends of a non-looping carousel. |
| `hideOnIdle` | `false` | Slide the previous arrow out to the left and the next arrow out to the right when the slide viewport is not hovered. |
| `prevHTML`, `nextHTML` | Built-in SVG | Custom button content as trusted HTML. |

All options are type-checked. `prevHTML` and `nextHTML` are trusted developer markup; sanitize untrusted content before passing it.

## Reveal arrows on hover

With `hideOnIdle: true` and the carousel stylesheet, arrows slide back in when the pointer enters the slide viewport. Hovering dots, thumbnails, or the surrounding host does not reveal them. Hidden arrows do not intercept pointer events. Visible keyboard focus on the carousel region or viewport contents also reveals the arrows; they remain in the keyboard tab order. Ordinary mouse focus after clicking an arrow does not keep it open after the pointer leaves.

Auto-hiding applies only when the browser reports a fine, hover-capable primary pointer and no coarse pointer. Touch and mixed-input devices retain visible controls, as do browsers without the required CSS selector support. `hideOnEdge` and the existing zero/one-slide behavior still apply.

The motion uses CSS transforms and opacity, with no additional listeners, timers, or layout measurements. It follows the themed arrow size and offset. Set `--carousel-control-duration` and `--carousel-control-timing` on the host to adjust the animation; `prefers-reduced-motion: reduce` disables it.

[Try auto-hiding arrows in the live demo](https://shelamkoff.github.io/carousel/#hover-arrows-example).

## Styling

The built-in SVG icons have the `carousel__arrow-icon` class. With the carousel stylesheet, set `--carousel-arrow-icon-size` on the carousel or an ancestor to change both icon dimensions (24px by default). Custom `prevHTML` and `nextHTML` are inserted unchanged; style that markup with your own selectors or opt into the same class.

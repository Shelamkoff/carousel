# Carousel: Continuous scrolling

```js
import { Carousel, createAutoScroll, createSwipe } from '@shelamkoff/carousel'

const autoScroll = createAutoScroll({
  speed: 40,
  direction: 'forward',
  autoStart: true,
  pauseOnHover: true,
  pauseOnFocus: true,
  pauseOnInteraction: false,
  respectReducedMotion: true,
})

const gallery = new Carousel(host, slides, {
  slidesPerView: 2.25,
  gap: 16,
  loop: true,
  plugins: [createSwipe({ mouse: true }), autoScroll],
})
```

Moves the gallery continuously using the core's animation clock and physical position. Speed is measured in CSS pixels per second, independent of slide width and `slidesPerScroll`. Distance follows elapsed time rather than a fixed number of pixels per frame; long stalls are bounded to prevent catch-up jumps. There is no interval, page jump or snap between slides. The shared render phase is `'scroll'`; layouts and slide effects receive the current position, and `transitionProgress` is `null`.

## Options

| Option | Default | Behavior |
| --- | --- | --- |
| `speed` | `40` | Positive finite speed in CSS pixels per second. |
| `direction` | `'forward'` | `'forward'` moves the content left/up; `'backward'` moves it right/down, following the carousel orientation. |
| `autoStart` | `true` | Request scrolling when the plugin is installed. |
| `pauseOnHover` | `true` | Pause while the pointer is over the carousel. |
| `pauseOnFocus` | `true` | Pause while keyboard focus is within the carousel. |
| `pauseOnInteraction` | `false` | With `true`, pointer interaction or manual navigation stops requested scrolling until `start()` is called. Otherwise scrolling resumes after the gesture/navigation ends. |
| `respectReducedMotion` | `true` | Pause while `prefers-reduced-motion: reduce` is active. Explicit `start()` does not override this preference. |

Hidden documents and held pointers always suspend movement. Resuming uses a fresh time origin, so time spent in a hidden tab or paused state does not move the gallery forward. Multiple pointers keep it paused until all are released. Explicit `start()` can override the current hover/focus pause, so an application-owned play button inside the carousel can resume movement. The next pointer entry or focus move pauses it again. Hidden documents, held pointers and respected reduced-motion preferences cannot be overridden by `start()`.

## Loop and finite navigation

With `loop: true`, positions wrap across the physical cycle continuously. Short loops use the same decorative snapshot policy as normal navigation; they do not create extra live embedded applications. The speed stays constant across the cycle boundary.

A finite gallery stops at its physical edge without jumping back to the start. The requested state remains active while movement is unavailable. Changing direction, navigating away from the boundary or adding more scrollable content allows it to continue. An empty gallery or a finite gallery with no scrollable extent stays paused. There is no arbitrary minimum slide count: movement depends on actual geometry.

Direction and speed changes retain the current position. Resizing follows the core's geometry reconciliation, preserving the relative position between neighboring slides. Collection updates retain the existing keyed content and selection contracts.

## Controller and state

| Method | Result |
| --- | --- |
| `start()` | Request scrolling from the current position. |
| `stop()` | Stop requested scrolling, keeping the position. |
| `toggle()` | Switch requested scrolling on/off. |
| `isActive()` | Requested state; can remain `true` during a temporary pause or at a finite boundary. |
| `getState()` | Read-only `{ available, active, paused, running, speed, direction, reducedMotion }`. |
| `update({ speed?, direction? })` | Validate and apply new speed/direction without remounting slides or snapping to a slide. |

`active` expresses the application's request. `running` means the gallery is currently moving. `paused` is true when requested scrolling is temporarily suspended. `available` is true while the plugin is installed, including at a finite boundary. `reducedMotion` is true when the system preference is currently pausing this controller; it remains false with `respectReducedMotion: false`.

`autoscroll:state` fires when the state changes, rather than on every animation frame. Use it to update a play/pause control without another animation loop:

```js
const button = document.querySelector('#gallery-playback')
function updatePlayback() {
  const state = autoScroll.getState()
  button.textContent = state.active ? 'Pause scrolling' : 'Resume scrolling'
  button.disabled = state.reducedMotion // This example keeps respectReducedMotion enabled.
}
button.addEventListener('click', () => autoScroll.toggle())
gallery.on('autoscroll:state', updatePlayback)
updatePlayback()
```

The plugin adds no UI. `createControls()` can still provide a slide counter, but its play button and elapsed-time progress belong to interval autoplay. `createAutoScroll()` and `createAutoplay()` are mutually exclusive on one carousel: installing the second throws. Remove the current controller before changing the playback mode.

Nearest-slide changes emit `slide:change`, keeping navigation controls in sync. Continuous movement does not emit per-card `slide:beforeChange`, `transition:start` or `transition:end`. Manual navigation uses the configured transition and temporarily owns the animation clock. The continuous controller waits for it to settle before resuming when `pauseOnInteraction` is `false`.

## Lifecycle and custom controllers

The plugin name is `'autoscroll'`. `gallery.unuse('autoscroll')` releases its motion, DOM/media-query listeners and event subscriptions. Destroying the carousel does the same. The plugin does not install an independent rendering loop or a per-slide `render` observer. A low-level `stopAnimation()` cancels the current motion but leaves the scrolling request active, so the plugin can resume after `motion:idle`; use `autoScroll.stop()` for a persistent pause.

For custom controllers, a plugin context exposes `startContinuousScroll(velocity)`, where signed velocity is in CSS pixels per second. It returns an owned `{ isRunning(), stop() }` handle or `null` when motion cannot start. Navigation, dragging or a degenerate/bounded position can prevent starting. Call it outside core event dispatch; use `queueMicrotask()` when requesting motion from a render/lifecycle callback. A handle can stop only its own motion; a stale handle cannot cancel replacement navigation. Context revocation stops motion started through that context. Use the built-in plugin when its pause and preference policies cover the application.

[Try the live scrolling gallery](https://shelamkoff.github.io/carousel/#continuous-example).

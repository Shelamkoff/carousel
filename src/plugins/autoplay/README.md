# Carousel: Autoplay

```js
import { createAutoplay, createControls } from '@shelamkoff/carousel'
const autoplay = createAutoplay({
  interval: 3000,
  pauseOnHover: true,
  pauseOnFocus: true,
  pauseOnInteraction: true,
})
// Include both in Carousel's plugins; either installation order is supported.
const controls = createControls({ playPause: true, progress: 'circle', counter: true })
```

Starts automatically when installed and a next destination exists. The first advance occurs after `interval`; subsequent intervals start after completed transitions. One deadline drives both navigation and `getState()` progress. There is no overlapping interval or independent progress timer.

| Option | Default | Behavior |
| --- | --- | --- |
| `interval` | `3000` | Display time in milliseconds, excluding transition duration. A number greater than zero and at most `2147483647` (the native timer limit). |
| `pauseOnHover` | `true` | Suspend while the pointer is over this carousel. |
| `pauseOnFocus` | `true` | Suspend while a control or slide has keyboard focus. |
| `pauseOnInteraction` | `true` | Stop after manual navigation or pointer interaction. Use `false` to resume after gestures and transitions. |

A hidden document always suspends playback. Multiple held pointers keep it suspended until all have ended. Hover, focus, visibility suspension and `stop()` preserve the remaining display time; `start()` resumes it. Explicit Play can override the current hover/focus pause so the button works while it is hovered or focused. The next entry or focus move pauses again. Hidden documents and held pointers cannot be overridden.

Navigation resets display time after the transition finishes. A pure resize preserves time; a changed slide collection or cancelled transition starts a fresh interval. The plugin stops at the final finite page, with at most one source slide, or when a loop's scroll step cannot change the selected slide. `start()` then stays inactive until navigation is possible. The controls button is disabled in that state; navigate backward or change the collection before restarting.

| Method | Result |
| --- | --- |
| `start()` | Request playback; resume remaining time. |
| `stop()` | Stop playback; retain remaining time. |
| `toggle()` | Switch requested playback state. |
| `isActive()` | Requested state; may be `true` during a temporary hover/focus pause. |
| `getState()` | Read-only `{ available, active, paused, running, interval, remaining, progress }`. |

`remaining` is milliseconds; `progress` is elapsed fraction `0..1`. `running` means the display interval is currently counting down. A transition also reports `paused: true`. `autoplay:state` fires on state changes, not every animation frame. `createControls()` reads the same snapshot while painting progress and stops its frame loop when paused or hidden by its options. `autoplay:start` / `autoplay:stop` retain their no-payload contract.

Autoplay does not add UI by itself. Install [Controls](../controls/README.md) to display the accessible playback button, elapsed-time ring/bar and source-slide counter. Each is independently configurable and themeable.

import { Carousel, createAutoplay, createControls } from '../src/index.js'
import type { AutoplayState, CarouselOptions, ControlsOptions, ControlsPlugin, PluginContext } from '../src/index.js'

const options: CarouselOptions = {
  orientation: 'vertical', viewportHeight: 420, slidesPerView: 1.15,
  breakpoints: { 800: { orientation: 'horizontal', slidesPerView: 2.25 } },
}
const controlOptions: ControlsOptions = {
  playPause: true, progress: 'circle', counter: true, position: 'overlay',
  labels: { play: 'Play', pause: 'Pause', progress: 'Time', counter: 'Slides', controls: 'Gallery controls' },
  formatCounter: (current, total) => `${current}/${total}`,
}
const controls: ControlsPlugin = createControls(controlOptions)
controls.update({ progress: 'bar', counter: false })
controls.update({ playPause: false, progress: false, counter: false })
const autoplay = createAutoplay({ interval: 4500, pauseOnFocus: true })
const state: Readonly<AutoplayState> = autoplay.getState()
const progress: number = state.progress
const remaining: number = state.remaining
const gallery = new Carousel(document.createElement('div'), [], {
  ...options, plugins: [controls, autoplay],
})
gallery.update({ orientation: 'horizontal', viewportHeight: undefined })
gallery.on('autoplay:state', snapshot => {
  const running: boolean = snapshot.running
  void running
})
function discover(context: PluginContext) {
  return context.getPlugin('autoplay')
}
void progress
void remaining
void discover

// @ts-expect-error Only explicit orientations are supported.
gallery.update({ orientation: 'diagonal' })
// @ts-expect-error Numeric pixel height is distinct from the CSS custom property.
gallery.update({ viewportHeight: '60vh' })
// @ts-expect-error Each control's visibility is a boolean.
controls.update({ counter: 'hidden' })
// @ts-expect-error Progress accepts the two styles or false.
createControls({ progress: true })
// @ts-expect-error A snapshot cannot mutate the autoplay controller.
state.remaining = 0

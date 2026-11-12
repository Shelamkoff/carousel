import { Carousel, createAutoScroll } from '../src/index.js'
import type { AutoScrollOptions, AutoScrollPlugin, AutoScrollState, CarouselScrollMotion, PluginContext } from '../src/index.js'

const options: AutoScrollOptions = { speed: 42, direction: 'backward', respectReducedMotion: true }
const plugin: AutoScrollPlugin = createAutoScroll(options)
const state: Readonly<AutoScrollState> = plugin.getState()
plugin.update({ speed: 80 })
plugin.stop()
plugin.start()
plugin.toggle()
const active: boolean = plugin.isActive()
declare const context: PluginContext
const motion: CarouselScrollMotion | null = context.startContinuousScroll(-40)
motion?.stop()
const running: boolean | undefined = motion?.isRunning()
declare const carousel: Carousel
carousel.on('autoscroll:state', value => { const speed: number = value.speed; void speed })
const phase: 'idle' | 'animation' | 'drag' | 'scroll' | undefined = carousel.getRenderState()?.phase
// @ts-expect-error visual directions are derived from orientation
createAutoScroll({ direction: 'left' })
// @ts-expect-error update does not replace the suspension policy
plugin.update({ pauseOnHover: false })
void [state, active, running, phase]

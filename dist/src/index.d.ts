// Core
export { Carousel } from './Carousel.js'
export const carouselStylesUrl: string

// Plugins
export { createArrows } from './plugins/arrows.js'
export { createDots } from './plugins/dots.js'
export { createThumbnails } from './plugins/thumbnails.js'
export { createKeyboard } from './plugins/keyboard.js'
export { createSwipe } from './plugins/swipe.js'
export { createAutoplay } from './plugins/autoplay.js'
export { createControls } from './plugins/controls.js'
export { createLazyLoad } from './plugins/lazyload.js'
export { createParallax } from './plugins/parallax.js'
export type { AutoplayPlugin } from './plugins/autoplay.js'
export type { ControlsOptions, ControlsPlugin } from './plugins/controls.js'

// Types
export type {
  SlideData,
  CarouselTransition,
  CarouselTransitionName,
  CarouselTransitionContext,
  CarouselTransitionInstance,
  CarouselTransitionDefinition,
  PluginContext,
  CarouselPlugin,
  CarouselOptions,
  CarouselResponsiveOptions,
  CarouselUpdateOptions,
  CarouselEventMap,
  CarouselEventName,
  AutoplayState,
} from './types.js'

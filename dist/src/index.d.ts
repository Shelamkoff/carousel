// Core
export { Carousel } from './Carousel.js'
export { createSurfaceCrossfade, createSurfacePageTurn } from './transitions/surfaces.js'
export type { SurfaceCrossfadeOptions, SurfacePageTurnOptions } from './transitions/surfaces.js'
export const carouselStylesUrl: string

// Plugins
export { createArrows } from './plugins/arrows.js'
export { createDots } from './plugins/dots.js'
export { createThumbnails } from './plugins/thumbnails.js'
export { createKeyboard } from './plugins/keyboard.js'
export { createSwipe } from './plugins/swipe.js'
export { createAutoplay } from './plugins/autoplay.js'
export { createAutoScroll } from './plugins/autoScroll.js'
export type { AutoScrollOptions, AutoScrollPlugin } from './plugins/autoScroll.js'
export { createControls } from './plugins/controls.js'
export { createLazyLoad } from './plugins/lazyload.js'
export { createParallax } from './plugins/parallax.js'
export type { AutoplayPlugin } from './plugins/autoplay.js'
export type { ControlsOptions, ControlsPlugin } from './plugins/controls.js'

// Types
export type {
  SlideData,
  SlideContent,
  SlideContentFactory,
  SlideContentInstance,
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
  AutoScrollState,
  CarouselScrollMotion,
} from './types.js'

export { createSlideEffect } from './effects/createSlideEffect.js'
export { createFocusEffect } from './effects/focus.js'
export type { FocusEffectOptions } from './effects/focus.js'
export type { SlidePatch } from './types.js'
export type {
  CarouselLayout, CarouselLayoutDefinition, CarouselLayoutContext, CarouselLayoutSlot,
  CarouselSlideGeometry, CarouselRenderState, CarouselRenderSlide,
  SlideEffectDefinition, SlideEffectContext, SlideEffectInstance,
} from './renderTypes.js'

export type {
  CarouselGeometrySlideDescriptor, CarouselGeometryContext, CarouselGeometrySlide,
  CarouselGeometryMeasurement, CarouselGeometryDefinition, CarouselNavigationGeometry,
  CarouselNavigationSlotDescriptor, CarouselNavigationSlot,
} from './navigationTypes.js'
export type {
  CarouselSurfaceTransitionContext, CarouselSurfaceTransitionDefinition, CarouselSurfaceTransitionInstance,
} from './transitionTypes.js'

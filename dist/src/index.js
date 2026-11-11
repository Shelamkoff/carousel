// Core
export { Carousel } from './Carousel.js'
export const carouselStylesUrl = new URL('../styles/carousel.css', import.meta.url).href

// Plugins
export { createArrows } from './plugins/arrows.js'
export { createDots } from './plugins/dots.js'
export { createThumbnails } from './plugins/thumbnails.js'
export { createKeyboard } from './plugins/keyboard.js'
export { createSwipe } from './plugins/swipe.js'
export { createAutoplay } from './plugins/autoplay.js'
export { createLazyLoad } from './plugins/lazyload.js'
export { createParallax } from './plugins/parallax.js'

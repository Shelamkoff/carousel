import { Carousel } from '../src/index.js'
import type { CarouselTransition, CarouselOptions } from '../src/index.js'

const transitions: CarouselTransition[] = ['slide', 'fade', 'stairs', 'pixel', 'curtain']
for (const transition of transitions) {
  const options: CarouselOptions = { transition, breakpoints: { 600: { transition } } }
  const carousel = new Carousel(document.createElement('div'), [], options)
  carousel.update({ transition })
}

// @ts-expect-error The word preloader is not a carousel transition.
const invalidTransition: CarouselTransition = 'words'
void invalidTransition

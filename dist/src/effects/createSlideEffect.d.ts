import type { CarouselPlugin } from '../types.js'
import type { SlideEffectDefinition } from '../renderTypes.js'
/** Returns a removable plugin named `effect:${definition.name}`. */
export function createSlideEffect(definition: SlideEffectDefinition): CarouselPlugin

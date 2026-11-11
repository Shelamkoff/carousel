import { createArrows } from '../src/index.js'
import type { CarouselPlugin } from '../src/index.js'

const defaultArrows: CarouselPlugin = createArrows()
const alwaysVisible: CarouselPlugin = createArrows({ hideOnIdle: false })
const hoverArrows: CarouselPlugin = createArrows({ hideOnIdle: true, hideOnEdge: false, prevHTML: 'Previous', nextHTML: 'Next' })
void [defaultArrows, alwaysVisible, hoverArrows]

// @ts-expect-error Idle hiding is a boolean opt-in, not a string mode.
createArrows({ hideOnIdle: 'hover' })
// @ts-expect-error Numeric truthy values are not supported.
createArrows({ hideOnIdle: 1 })
// @ts-expect-error Omit the option to use its default; null is not a boolean.
createArrows({ hideOnIdle: null })

import type { CarouselGeometryContext, CarouselGeometryDefinition, CarouselNavigationGeometry } from './navigationTypes.js'

export interface NavigationGeometry extends CarouselNavigationGeometry {}
export class NavigationGeometry {
  constructor(context: CarouselGeometryContext, definition?: CarouselGeometryDefinition, uniform?: { slideSize: number; step: number })
}

export function createNavigationGeometry(context: CarouselGeometryContext, definition?: CarouselGeometryDefinition,
  uniform?: { slideSize: number; step: number }): NavigationGeometry

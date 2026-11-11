import type { PluginContext } from '../src/index.js'

declare const context: PluginContext
const loop = context.getLoopEngine()
if (loop) {
  const forward: number = loop.directedDelta(0, 1, 1)
  const backward: number = loop.directedDelta(0, 1, -1)
  void forward
  void backward
  // @ts-expect-error Directed navigation requires an explicit forward/backward direction.
  loop.directedDelta(0, 1, 0)
}

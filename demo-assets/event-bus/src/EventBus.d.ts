export type EventMap = Record<string, unknown[]>

export declare class EventBus<
  Events extends { [K in keyof Events]: unknown[] } = Record<string, unknown[]>,
> {
  constructor(options?: { debug?: boolean })

  on<K extends keyof Events & string>(event: K, handler: (...args: Events[K]) => void): () => void
  off<K extends keyof Events & string>(event: K, handler: (...args: Events[K]) => void): void
  once<K extends keyof Events & string>(event: K, handler: (...args: Events[K]) => void): () => void
  emit<K extends keyof Events & string>(event: K, ...args: Events[K]): void
  clear(event?: keyof Events & string): void
  has(event: keyof Events & string): boolean
}

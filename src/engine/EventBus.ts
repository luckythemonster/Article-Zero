// EventBus — the only bridge between subsystems, Phaser, and React.
// Strict directive: do not refactor or remove. All cross-system signalling
// passes through here.

import type { EventMap, EventName } from "../types/events.types";

type Handler<K extends EventName> = (payload: EventMap[K]) => void;

class EventBus {
  // Storage is loosely typed internally; the public API enforces the typed map.
  private listeners: Partial<Record<EventName, Set<(payload: any) => void>>> = {};

  on<K extends EventName>(event: K, handler: Handler<K>): () => void {
    let bucket = this.listeners[event];
    if (!bucket) {
      bucket = new Set();
      this.listeners[event] = bucket;
    }
    bucket.add(handler as (payload: any) => void);
    return () => this.off(event, handler);
  }

  off<K extends EventName>(event: K, handler: Handler<K>): void {
    this.listeners[event]?.delete(handler as (payload: any) => void);
  }

  emit<K extends EventName>(event: K, payload: EventMap[K]): void {
    const bucket = this.listeners[event];
    if (!bucket) return;
    for (const handler of bucket) handler(payload);
  }

  once<K extends EventName>(event: K, handler: Handler<K>): void {
    const wrapper: Handler<K> = (payload) => {
      handler(payload);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  clear<K extends EventName>(event?: K): void {
    if (event) delete this.listeners[event];
    else this.listeners = {};
  }
}

export const eventBus = new EventBus();

// EventBus — the only bridge between subsystems, Phaser, and React.
// Strict directive: do not refactor or remove. All cross-system signalling
// passes through here.

import type { EventMap, EventName } from "../types/events.types";

type Handler<K extends EventName> = (payload: EventMap[K]) => void;

/**
 * A lifecycle-scoped view over the EventBus. Subscriptions made through a scope
 * are tracked automatically; calling `dispose()` removes every one of them in a
 * single call — no manual unsubscribe-callback bookkeeping at the call site.
 *
 * Intended for consumers with a clear teardown point (a Phaser scene's
 * `create()`/`shutdown()`, a React effect's setup/cleanup). `add()` lets a scope
 * also own non-bus teardowns (e.g. a Zustand `subscribe` unsubscribe) so a
 * single `dispose()` tears down everything the consumer registered.
 */
export interface EventScope {
  on<K extends EventName>(event: K, handler: Handler<K>): void;
  once<K extends EventName>(event: K, handler: Handler<K>): void;
  /** Register an arbitrary teardown to run on dispose (e.g. store unsubscribe). */
  add(off: () => void): void;
  /** Remove every subscription/teardown registered through this scope. */
  dispose(): void;
}

class EventBus {
  // `any` (intentional): each event key has a different payload type, so a
  // single Set can't be expressed without per-key existential types (not
  // representable in TS). Storage is loosely typed; the public on/emit/off
  // signatures (Handler<K>) enforce the typed EventMap at every call site.
  private listeners: Partial<Record<EventName, Set<(payload: any) => void>>> = {};

  on<K extends EventName>(event: K, handler: Handler<K>): () => void {
    let bucket = this.listeners[event];
    if (!bucket) {
      bucket = new Set();
      this.listeners[event] = bucket;
    }
    // `any` cast: bridges the typed Handler<K> to the erased storage type above.
    bucket.add(handler as (payload: any) => void);
    return () => this.off(event, handler);
  }

  off<K extends EventName>(event: K, handler: Handler<K>): void {
    // `any` cast: same erasure as on(); identity is preserved so delete works.
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

  /**
   * Create a lifecycle-scoped subscription handle. Prefer this over raw `on()`
   * wherever there's a defined teardown point — it removes the fragile pattern
   * of stashing each unsubscribe callback in an array and replaying it by hand.
   */
  createScope(): EventScope {
    const offs: Array<() => void> = [];
    return {
      on: (event, handler) => {
        offs.push(this.on(event, handler));
      },
      once: (event, handler) => {
        // Mirror once() but route through the scope so a dispose() before the
        // event fires still detaches the pending wrapper.
        const wrapper: Handler<typeof event> = (payload) => {
          handler(payload);
          this.off(event, wrapper);
        };
        offs.push(this.on(event, wrapper));
      },
      add: (off) => {
        offs.push(off);
      },
      dispose: () => {
        for (const off of offs) off();
        offs.length = 0;
      },
    };
  }
}

export const eventBus = new EventBus();

/**
 * @file projection.bus.ts
 * @description Event-driven PubSub bus that emits projection updates when repositories
 * or background sync state changes.
 */

export type ProjectionEventType =
  | 'MENU_UPDATED'
  | 'ORDERS_UPDATED'
  | 'TABLES_UPDATED'
  | 'AGGREGATORS_UPDATED'
  | 'CUSTOMERS_UPDATED'
  | 'ALL_UPDATED';

export type ProjectionListener = (event: ProjectionEventType, data?: unknown) => void;

class ProjectionBusClass {
  private listeners: Set<ProjectionListener> = new Set();

  /** Subscribe to projection update events */
  subscribe(listener: ProjectionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Subscribe to a specific projection event */
  on(targetEvent: ProjectionEventType, listener: (data?: unknown) => void): () => void {
    return this.subscribe((event, data) => {
      if (event === targetEvent || event === 'ALL_UPDATED') {
        listener(data);
      }
    });
  }

  /** Remove listener */
  off(listener: ProjectionListener): void {
    this.listeners.delete(listener);
  }

  /** Emit projection update event to all subscribers */
  emit(event: ProjectionEventType, data?: unknown): void {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (err) {
        console.error(`[ProjectionBus] Error in listener for event ${event}:`, err);
      }
    });
  }

  /** Clear all listeners */
  clear(): void {
    this.listeners.clear();
  }
}

export const projectionBus = new ProjectionBusClass();


/**
 * Simple message bus for intra-background-script communication
 * Used to communicate between webmcp-manager and native-host
 */

type MessageHandler = (message: any) => void;

const handlers: Map<string, MessageHandler[]> = new Map();

export function on(type: string, handler: MessageHandler): void {
  if (!handlers.has(type)) {
    handlers.set(type, []);
  }
  handlers.get(type)!.push(handler);
}

export function off(type: string, handler: MessageHandler): void {
  const list = handlers.get(type);
  if (list) {
    const index = list.indexOf(handler);
    if (index !== -1) {
      list.splice(index, 1);
    }
  }
}

export function emit(type: string, message: any): void {
  const list = handlers.get(type);
  if (list) {
    list.forEach((handler) => {
      try {
        handler(message);
      } catch (e) {
        console.error(`[MessageBus] Error in handler for ${type}:`, e);
      }
    });
  }
}

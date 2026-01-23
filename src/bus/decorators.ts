import { resolveHandler, type LegacyDecorator } from "../core/handler";
import { registerEvent } from "../core/registry";

export function On(event: string): LegacyDecorator {
  return (target, propertyKey, descriptor) => {
    if (!event) {
      throw new Error("@On() requires an event name.");
    }
    const handler = resolveHandler(target, propertyKey, descriptor);
    registerEvent(handler, event);
  };
}

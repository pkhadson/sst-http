import { resolveHandler, type LegacyDecorator } from "../core/handler";
import { registerEvent } from "../core/registry";
import type { OnOptions } from "../core/types";

export function On(event: string, options: OnOptions = {}): LegacyDecorator {
  return (target, propertyKey, descriptor) => {
    if (!event) {
      throw new Error("@On() requires an event name.");
    }
    if (
      options.delay !== undefined
      && (!Number.isInteger(options.delay) || options.delay < 0 || options.delay > 900)
    ) {
      throw new Error("@On({ delay }) expects an integer from 0 to 900 seconds.");
    }
    const handler = resolveHandler(target, propertyKey, descriptor);
    registerEvent(handler, event, options);
  };
}

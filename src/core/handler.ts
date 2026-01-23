import type { Handler } from "./types";

export type LegacyDecorator = (
  target: unknown,
  propertyKey?: string | symbol,
  descriptor?: PropertyDescriptor,
) => void;

export type LegacyParameterDecorator = (
  target: unknown,
  propertyKey: string | symbol | undefined,
  parameterIndex: number,
) => void;

export function resolveHandler(
  target: unknown,
  propertyKey?: string | symbol,
  descriptor?: PropertyDescriptor,
): Handler {
  if (descriptor?.value && typeof descriptor.value === "function") {
    return descriptor.value as Handler;
  }
  if (typeof target === "function" && propertyKey === undefined) {
    return target as Handler;
  }
  if (target && propertyKey && typeof (target as Record<PropertyKey, unknown>)[propertyKey] === "function") {
    return (target as Record<PropertyKey, unknown>)[propertyKey] as Handler;
  }
  throw new Error("Unable to determine decorated function. Ensure decorators are applied to functions.");
}

import type { ZodTypeAny } from "zod/v4";
import type { FirebaseAuthOptions, Handler, HttpMethod, ParameterType } from "./types";
import { registerFirebaseAuth, registerParameter, registerRoute } from "./registry";

type LegacyDecorator = (
  target: unknown,
  propertyKey?: string | symbol,
  descriptor?: PropertyDescriptor,
) => void;

type LegacyParameterDecorator = (
  target: unknown,
  propertyKey: string | symbol | undefined,
  parameterIndex: number,
) => void;

function resolveHandler(
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

function createRouteDecorator(method: HttpMethod) {
  return (path?: string): LegacyDecorator =>
    (target, propertyKey, descriptor) => {
      const handler = resolveHandler(target, propertyKey, descriptor);
      registerRoute(handler, method, path);
    };
}

function createParameterDecorator(type: ParameterType, schema?: ZodTypeAny): LegacyParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    const handler = resolveHandler(target, propertyKey);
    registerParameter(handler, {
      index: parameterIndex,
      type,
      schema,
    });
  };
}

export const Get = createRouteDecorator("GET");
export const Post = createRouteDecorator("POST");
export const Put = createRouteDecorator("PUT");
export const Patch = createRouteDecorator("PATCH");
export const Delete = createRouteDecorator("DELETE");
export const Head = createRouteDecorator("HEAD");
export const Options = createRouteDecorator("OPTIONS");

export function FirebaseAuth(options?: FirebaseAuthOptions): LegacyDecorator {
  return (target, propertyKey, descriptor) => {
    const handler = resolveHandler(target, propertyKey, descriptor);
    registerFirebaseAuth(handler, options);
  };
}

export function Auth(): LegacyParameterDecorator {
  return createParameterDecorator("auth");
}

export function Body(schema?: ZodTypeAny): LegacyParameterDecorator {
  return createParameterDecorator("body", schema);
}

export function Query(): LegacyParameterDecorator {
  return createParameterDecorator("query");
}

export function Param(): LegacyParameterDecorator {
  return createParameterDecorator("param");
}

export function Headers(): LegacyParameterDecorator {
  return createParameterDecorator("headers");
}

export function Req(): LegacyParameterDecorator {
  return createParameterDecorator("req");
}

export function Res(): LegacyParameterDecorator {
  return createParameterDecorator("res");
}

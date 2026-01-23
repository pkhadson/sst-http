import type { ZodTypeAny } from "zod/v4";
import type { FirebaseAuthOptions, HttpMethod, ParameterType } from "../core/types";
import { resolveHandler, type LegacyDecorator, type LegacyParameterDecorator } from "../core/handler";
import { registerFirebaseAuth, registerParameter, registerRoute } from "../core/registry";

function createRouteDecorator(method: HttpMethod) {
  return (path?: string): LegacyDecorator =>
    (target, propertyKey, descriptor) => {
      const handler = resolveHandler(target, propertyKey, descriptor);
      registerRoute(handler, method, path);
    };
}

function createParameterDecorator(
  type: ParameterType,
  options?: {
    schema?: ZodTypeAny;
    name?: string;
  },
): LegacyParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    const handler = resolveHandler(target, propertyKey);
    registerParameter(handler, {
      index: parameterIndex,
      type,
      schema: options?.schema,
      name: options?.name,
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
  return createParameterDecorator("body", { schema });
}

export function Query(name?: string): LegacyParameterDecorator {
  return createParameterDecorator("query", { name });
}

export function Param(name?: string): LegacyParameterDecorator {
  return createParameterDecorator("param", { name });
}

export function Headers(): LegacyParameterDecorator {
  return createParameterDecorator("headers");
}

export function Header(name: string): LegacyParameterDecorator {
  return createParameterDecorator("header", { name });
}

export function Req(): LegacyParameterDecorator {
  return createParameterDecorator("req");
}

export function Res(): LegacyParameterDecorator {
  return createParameterDecorator("res");
}

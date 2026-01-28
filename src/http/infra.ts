import { normalizeApiGatewayPath } from "./paths";
import type { HttpMethod, RoutesManifest, RoutesManifestRoute } from "../core/types";
import {
  ensureRecord,
  getFunction,
  isRecord,
  resolveHandlerInput,
} from "../core/infra";

export type RegisterRouteConfig = {
  handler: unknown;
  protected: boolean;
  authorizer?: {
    name: string;
    optional?: boolean;
    roles?: string[];
    ref?: unknown;
  };
};

export type RegisterRoute = (
  method: HttpMethod,
  path: string,
  config: RegisterRouteConfig,
) => void;

export type EnsureJwtAuthorizer = (
  name: string,
  cfg: { issuer: string; audiences: string[] },
) => unknown;

type AdapterArgs = {
  api: unknown;
};

export function wireRoutesFromManifest(
  manifest: RoutesManifest,
  opts: {
    handler: unknown;
    firebaseProjectId?: string;
    registerRoute: RegisterRoute;
    ensureJwtAuthorizer?: EnsureJwtAuthorizer;
  },
): void {
  const firebaseRoutes = manifest.routes.filter((route) => route.auth.type === "firebase");
  const firebaseAuthorizerRef = ensureFirebaseAuthorizer(firebaseRoutes.length, opts);

  for (const route of manifest.routes) {
    const isProtected = route.auth.type === "firebase";
    const rawPath = route.path.startsWith("/") ? route.path : `/${route.path}`;
    const path = normalizeApiGatewayPath(rawPath);
    const authConfig = buildAuthorizerConfig(route, firebaseAuthorizerRef);

    opts.registerRoute(route.method, path, {
      handler: opts.handler,
      protected: isProtected,
      authorizer: authConfig,
    });
  }
}

export function httpApiAdapter(args: AdapterArgs) {
  const api = args.api;

  const ensureJwtAuthorizer = createHttpAuthorizerManager(api);
  const registerRoute = createRouteRegistrar(api, "ApiGatewayV2");

  return {
    api,
    registerRoute,
    ensureJwtAuthorizer,
  };
}

export function restApiAdapter(args: AdapterArgs) {
  const api = args.api;

  const ensureJwtAuthorizer = createRestAuthorizerManager(api);
  const registerRoute = createRouteRegistrar(api, "ApiGateway");

  return {
    api,
    registerRoute,
    ensureJwtAuthorizer,
  };
}

function ensureFirebaseAuthorizer(
  firebaseRouteCount: number,
  opts: {
    firebaseProjectId?: string;
    ensureJwtAuthorizer?: EnsureJwtAuthorizer;
  },
): unknown {
  if (firebaseRouteCount === 0) {
    return undefined;
  }
  if (!opts.firebaseProjectId) {
    throw new Error("firebaseProjectId is required when using @FirebaseAuth()");
  }
  if (!opts.ensureJwtAuthorizer) {
    throw new Error("ensureJwtAuthorizer is required when using @FirebaseAuth()");
  }
  const issuer = `https://securetoken.google.com/${opts.firebaseProjectId}`;
  return opts.ensureJwtAuthorizer("firebase", {
    issuer,
    audiences: [opts.firebaseProjectId],
  });
}

function buildAuthorizerConfig(
  route: RoutesManifestRoute,
  firebaseAuthorizerRef: unknown,
): RegisterRouteConfig["authorizer"] | undefined {
  if (route.auth.type !== "firebase") {
    return undefined;
  }
  return {
    name: "firebase",
    optional: route.auth.optional,
    roles: route.auth.roles,
    ref: firebaseAuthorizerRef,
  };
}

function createHttpAuthorizerManager(api: unknown): EnsureJwtAuthorizer {
  const authorizers = new Map<string, unknown>();

  return (name, cfg) => {
    if (authorizers.has(name)) {
      return authorizers.get(name);
    }

    const addAuthorizer = getFunction(api, "addAuthorizer");
    const addAuthorizers = getFunction(api, "addAuthorizers");
    const authorizer = getFunction(api, "authorizer");
    let ref: unknown = undefined;

    if (addAuthorizer) {
      const created = addAuthorizer.call(api, {
        name,
        jwt: { issuer: cfg.issuer, audiences: cfg.audiences },
      });
      if (isRecord(created) && "id" in created) {
        ref = (created as { id?: unknown }).id ?? created;
      } else {
        ref = created;
      }
    } else if (addAuthorizers) {
      addAuthorizers.call(api, {
        [name]: {
          type: "jwt",
          jwt: {
            issuer: cfg.issuer,
            audience: cfg.audiences,
          },
        },
      });
      ref = name;
    } else if (authorizer) {
      ref = authorizer.call(api, name, {
        type: "jwt",
        jwt: {
          issuer: cfg.issuer,
          audience: cfg.audiences,
        },
      });
    } else {
      throw new Error("ApiGatewayV2 instance does not support authorizers");
    }

    authorizers.set(name, ref);
    return ref;
  };
}

function createRestAuthorizerManager(api: unknown): EnsureJwtAuthorizer {
  const authorizers = new Map<string, unknown>();

  return (name, cfg) => {
    if (authorizers.has(name)) {
      return authorizers.get(name);
    }

    const payload = {
      type: "jwt",
      jwt: {
        issuer: cfg.issuer,
        audience: cfg.audiences,
      },
    };

    const addAuthorizers = getFunction(api, "addAuthorizers");
    const authorizer = getFunction(api, "authorizer");
    let ref: unknown = name;

    if (addAuthorizers) {
      addAuthorizers.call(api, {
        [name]: payload,
      });
    } else if (authorizer) {
      ref = authorizer.call(api, name, payload);
    } else {
      const apiRecord = ensureRecord(api, "ApiGateway instance does not support authorizers.");
      const current = isRecord(apiRecord.authorizers) ? apiRecord.authorizers : {};
      apiRecord.authorizers = {
        ...current,
        [name]: payload,
      };
    }

    authorizers.set(name, ref);
    return ref;
  };
}

function createRouteRegistrar(
  api: unknown,
  apiLabel: string,
): RegisterRoute {
  return (method, path, config) => {
    const normalizedPath = normalizeApiGatewayPath(path);
    const routeKey = `${method} ${normalizedPath}`;
    const handlerInput = resolveHandlerInput(config.handler);
    const args = buildRouteArgs(config);

    const route = getFunction(api, "route");
    if (route) {
      route.call(api, routeKey, handlerInput, args);
      return;
    }

    const addRoutes = getFunction(api, "addRoutes");
    if (addRoutes) {
      addRoutes.call(api, {
        [routeKey]: {
          handler: handlerInput,
          ...args,
        },
      });
      return;
    }

    const addRoute = getFunction(api, "addRoute");
    if (addRoute) {
      addRoute.call(api, routeKey, { handler: handlerInput, ...args });
      return;
    }

    throw new Error(`Unsupported ${apiLabel} instance: expected route() or addRoutes() method.`);
  };
}

function buildRouteArgs(config: RegisterRouteConfig): Record<string, unknown> {
  if (!config.protected || !config.authorizer) {
    return {};
  }
  return {
    auth: {
      jwt: {
        authorizer: config.authorizer.ref ?? config.authorizer.name,
        scopes: config.authorizer.roles,
      },
    },
  };
}

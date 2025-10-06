import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HttpMethod, RoutesManifest } from "./types";
import * as sst from "sst";

export type RegisterRouteConfig = {
  handler: string;
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

export function wireApiFromManifest(
  manifest: RoutesManifest,
  opts: {
    handlerFile: string;
    firebaseProjectId: string;
    registerRoute: RegisterRoute;
    ensureJwtAuthorizer: EnsureJwtAuthorizer;
  },
): void {
  if (!manifest || !Array.isArray(manifest.routes)) {
    throw new Error("Invalid routes manifest");
  }

  const firebaseRoutes = manifest.routes.filter((route) => route.auth.type === "firebase");

  let firebaseAuthorizerRef: unknown;
  if (firebaseRoutes.length > 0) {
    if (!opts.firebaseProjectId) {
      throw new Error("firebaseProjectId is required when using @FirebaseAuth()");
    }

    const issuer = `https://securetoken.google.com/${opts.firebaseProjectId}`;
    firebaseAuthorizerRef = opts.ensureJwtAuthorizer("firebase", {
      issuer,
      audiences: [opts.firebaseProjectId],
    });
  }

  for (const route of manifest.routes) {
    const isProtected = route.auth.type === "firebase";
    const path = route.path.startsWith("/") ? route.path : `/${route.path}`;
    const authConfig = isProtected && route.auth.type === "firebase"
      ? {
          name: "firebase",
          optional: route.auth.optional,
          roles: route.auth.roles,
          ref: firebaseAuthorizerRef,
        }
      : undefined;

    opts.registerRoute(route.method, path, {
      handler: opts.handlerFile,
      protected: isProtected,
      authorizer: authConfig,
    });
  }
}

export function loadRoutesManifest(filePath: string): RoutesManifest {
  const resolved = resolve(filePath);
  const contents = readFileSync(resolved, "utf8");
  const manifest = JSON.parse(contents) as RoutesManifest;

  if (!manifest || !Array.isArray(manifest.routes)) {
    throw new Error(`Invalid routes manifest at ${resolved}`);
  }

  return manifest;
}

export function httpApiAdapter(args?: {
  apiName?: string;
  apiArgs?: ConstructorParameters<typeof sst.aws.ApiGatewayV2>[1];
}) {
  const api = new (sst as any).aws.ApiGatewayV2(args?.apiName ?? "HttpApi", args?.apiArgs);
  const authorizers = new Map<string, unknown>();

  const ensureJwtAuthorizer: EnsureJwtAuthorizer = (name, cfg) => {
    if (authorizers.has(name)) {
      return authorizers.get(name);
    }

    const apiAny = api as any;
    let ref: unknown = name;

    const payload = {
      type: "jwt",
      jwt: {
        issuer: cfg.issuer,
        audience: cfg.audiences,
      },
    };

    if (typeof apiAny.addAuthorizers === "function") {
      apiAny.addAuthorizers({
        [name]: payload,
      });
    } else if (typeof apiAny.authorizer === "function") {
      ref = apiAny.authorizer(name, payload);
    } else {
      apiAny.authorizers = {
        ...(apiAny.authorizers ?? {}),
        [name]: payload,
      };
    }

    authorizers.set(name, ref);
    return ref;
  };

  const registerRoute: RegisterRoute = (method, path, config) => {
    const apiAny = api as any;
    const routeKey = `${method} ${path}`;

    const routeConfig: Record<string, unknown> = {
      handler: config.handler,
    };

    if (config.protected && config.authorizer) {
      routeConfig.authorizer = config.authorizer.ref ?? config.authorizer.name;
      routeConfig.authorizationType = "JWT";
      if (config.authorizer.roles && config.authorizer.roles.length > 0) {
        routeConfig.authorizationScopes = config.authorizer.roles;
      }
      if (config.authorizer.optional) {
        (routeConfig as Record<string, unknown>).authorizerOptional = true;
      }
    }

    if (typeof apiAny.route === "function") {
      apiAny.route(routeKey, routeConfig);
      return;
    }

    if (typeof apiAny.addRoutes === "function") {
      apiAny.addRoutes({
        [routeKey]: routeConfig,
      });
      return;
    }

    if (typeof apiAny.addRoute === "function") {
      apiAny.addRoute(routeKey, routeConfig);
      return;
    }

    throw new Error("Unsupported ApiGatewayV2 instance: expected route() or addRoutes() method.");
  };

  return {
    api,
    registerRoute,
    ensureJwtAuthorizer,
  };
}

export function restApiAdapter(args?: {
  apiName?: string;
  apiArgs?: ConstructorParameters<typeof sst.aws.ApiGateway>[1];
}) {
  const api = new (sst as any).aws.ApiGateway(args?.apiName ?? "RestApi", args?.apiArgs);
  const authorizers = new Map<string, unknown>();

  const ensureJwtAuthorizer: EnsureJwtAuthorizer = (name, cfg) => {
    if (authorizers.has(name)) {
      return authorizers.get(name);
    }

    const apiAny = api as any;
    let ref: unknown = name;

    const payload = {
      type: "jwt",
      jwt: {
        issuer: cfg.issuer,
        audience: cfg.audiences,
      },
    };

    if (typeof apiAny.addAuthorizers === "function") {
      apiAny.addAuthorizers({
        [name]: payload,
      });
    } else if (typeof apiAny.authorizer === "function") {
      ref = apiAny.authorizer(name, payload);
    } else {
      apiAny.authorizers = {
        ...(apiAny.authorizers ?? {}),
        [name]: payload,
      };
    }

    authorizers.set(name, ref);
    return ref;
  };

  const registerRoute: RegisterRoute = (method, path, config) => {
    const apiAny = api as any;
    const routeKey = `${method} ${path}`;

    const routeConfig: Record<string, unknown> = {
      handler: config.handler,
    };

    if (config.protected && config.authorizer) {
      routeConfig.authorizer = config.authorizer.ref ?? config.authorizer.name;
      routeConfig.authorizationType = "JWT";
      if (config.authorizer.roles && config.authorizer.roles.length > 0) {
        routeConfig.authorizationScopes = config.authorizer.roles;
      }
      if (config.authorizer.optional) {
        (routeConfig as Record<string, unknown>).authorizerOptional = true;
      }
    }

    if (typeof apiAny.route === "function") {
      apiAny.route(routeKey, routeConfig);
      return;
    }

    if (typeof apiAny.addRoutes === "function") {
      apiAny.addRoutes({
        [routeKey]: routeConfig,
      });
      return;
    }

    if (typeof apiAny.addRoute === "function") {
      apiAny.addRoute(routeKey, routeConfig);
      return;
    }

    throw new Error("Unsupported ApiGateway instance: expected route() or addRoutes() method.");
  };

  return {
    api,
    registerRoute,
    ensureJwtAuthorizer,
  };
}

export type {
  RoutesManifest,
  RoutesManifestRoute,
  RoutesManifestAuth,
} from "./types";

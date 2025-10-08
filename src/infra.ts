import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HttpMethod, RoutesManifest } from "./types";

type SstApiGateway = {
  route?: (
    routeKey: string,
    handlerOrConfig: unknown,
    args?: Record<string, unknown>,
  ) => unknown;
  addRoutes?: (routes: Record<string, Record<string, unknown>>) => unknown;
  addRoute?: (routeKey: string, config: Record<string, unknown>) => unknown;
  addAuthorizers?: (authorizers: Record<string, unknown>) => unknown;
  authorizer?: (name: string, payload: unknown) => unknown;
  authorizers?: Record<string, unknown>;
  url?: string;
};

type SstAwsNamespace = {
  ApiGatewayV2: new (name: string, args?: unknown, opts?: unknown) => SstApiGateway;
  ApiGateway: new (name: string, args?: unknown, opts?: unknown) => SstApiGateway;
};

type AwsSource = {
  sst?: {
    aws?: SstAwsNamespace;
  };
};

function ensureSstAws(source?: AwsSource): SstAwsNamespace {
  if (source?.sst?.aws) {
    return source.sst.aws;
  }

  const aws = (globalThis as { sst?: { aws?: SstAwsNamespace } }).sst?.aws;
  if (!aws) {
    throw new Error(
      "SST aws namespace is not available. Ensure this code runs within an SST config.",
    );
  }
  return aws;
}

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

export function wireApiFromManifest(
  manifest: RoutesManifest,
  opts: {
    handler: unknown;
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
      handler: opts.handler,
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

type AdapterArgs = AwsSource & {
  api?: SstApiGateway;
  apiName?: string;
  apiArgs?: unknown;
};

export function httpApiAdapter(args?: AdapterArgs) {
  const aws = args?.api ? undefined : ensureSstAws(args);
  const api = args?.api ?? new aws!.ApiGatewayV2(args?.apiName ?? "HttpApi", args?.apiArgs);
  const authorizers = new Map<string, unknown>();

  const ensureJwtAuthorizer: EnsureJwtAuthorizer = (name, cfg) => {
    if (authorizers.has(name)) {
      return authorizers.get(name);
    }

    const apiAny = api;
    let ref: unknown = undefined;

    if (typeof (apiAny as Record<string, unknown>)["addAuthorizer"] === "function") {
      // Prefer official addAuthorizer API which returns an authorizer with .id
      const created = (apiAny as unknown as {
        addAuthorizer: (args: { name: string; jwt: { issuer: string; audiences: string[] } }) => { id: unknown };
      }).addAuthorizer({
        name,
        jwt: { issuer: cfg.issuer, audiences: cfg.audiences },
      });
      ref = (created as { id: unknown }).id;
    } else if (typeof apiAny.addAuthorizers === "function") {
      // Legacy shape
      apiAny.addAuthorizers({
        [name]: {
          type: "jwt",
          jwt: {
            issuer: cfg.issuer,
            audience: cfg.audiences,
          },
        },
      });
      ref = name;
    } else if (typeof apiAny.authorizer === "function") {
      ref = apiAny.authorizer(name, {
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

  const registerRoute: RegisterRoute = (method, path, config) => {
    const apiAny = api;
    const routeKey = `${method} ${path}`;

    const asAny = config.handler as Record<string, unknown> | string | undefined;
    const handlerInput =
      typeof asAny === "string"
        ? asAny
        : asAny && typeof (asAny as Record<string, unknown>).arn !== "undefined"
          ? (asAny as Record<string, unknown>).arn
          : asAny && typeof (asAny as Record<string, unknown>).handler === "string"
            ? (asAny as Record<string, unknown>).handler
            : asAny === undefined
              ? undefined
              : (() => {
                throw new Error("Unsupported handler type: provide a handler string, FunctionArgs, or a Function ARN/output");
              })();

    const args: Record<string, unknown> = {};
    if (config.protected && config.authorizer) {
      args.auth = {
        jwt: {
          authorizer: (config.authorizer.ref ?? config.authorizer.name) as unknown,
          scopes: config.authorizer.roles,
        },
      };
    }

    if (typeof apiAny.route === "function") {
      apiAny.route(routeKey, handlerInput, args);
      return;
    }

    if (typeof apiAny.addRoutes === "function") {
      // Fallback for older APIs: pass merged config
      apiAny.addRoutes({
        [routeKey]: {
          handler: handlerInput,
          ...args,
        },
      });
      return;
    }

    if (typeof apiAny.addRoute === "function") {
      apiAny.addRoute(routeKey, { handler: handlerInput, ...args });
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

export function restApiAdapter(args?: AdapterArgs) {
  const aws = args?.api ? undefined : ensureSstAws(args);
  const api = args?.api ?? new aws!.ApiGateway(args?.apiName ?? "RestApi", args?.apiArgs);
  const authorizers = new Map<string, unknown>();

  const ensureJwtAuthorizer: EnsureJwtAuthorizer = (name, cfg) => {
    if (authorizers.has(name)) {
      return authorizers.get(name);
    }

    const apiAny = api;
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
    const apiAny = api;
    const routeKey = `${method} ${path}`;

    const asAny = config.handler as Record<string, unknown> | string | undefined;
    const handlerInput =
      typeof asAny === "string"
        ? asAny
        : asAny && typeof (asAny as Record<string, unknown>).arn !== "undefined"
          ? (asAny as Record<string, unknown>).arn
          : asAny && typeof (asAny as Record<string, unknown>).handler === "string"
            ? (asAny as Record<string, unknown>).handler
            : asAny === undefined
              ? undefined
              : (() => {
                throw new Error("Unsupported handler type: provide a handler string, FunctionArgs, or a Function ARN/output");
              })();

    const args: Record<string, unknown> = {};
    if (config.protected && config.authorizer) {
      args.auth = {
        jwt: {
          authorizer: (config.authorizer.ref ?? config.authorizer.name) as unknown,
          scopes: config.authorizer.roles,
        },
      };
    }

    if (typeof apiAny.route === "function") {
      apiAny.route(routeKey, handlerInput, args);
      return;
    }

    if (typeof apiAny.addRoutes === "function") {
      apiAny.addRoutes({
        [routeKey]: {
          handler: handlerInput,
          ...args,
        },
      });
      return;
    }

    if (typeof apiAny.addRoute === "function") {
      apiAny.addRoute(routeKey, { handler: handlerInput, ...args });
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

import type {
  FirebaseAuthMetadata,
  FirebaseAuthOptions,
  Handler,
  ParameterMetadata,
  RouteOptions,
  RouteRegistryEntry,
  HttpMethod,
} from "./types";

const routeMeta = new Map<Handler, {
  method?: HttpMethod;
  path?: string;
  auth?: FirebaseAuthMetadata;
}>();

const parameterMeta = new Map<Handler, ParameterMetadata[]>();

let options: RouteOptions = {
  inferPathFromName: false,
};

export function configureRoutes(next?: RouteOptions): void {
  options = {
    ...options,
    ...next,
  };
}

export function registerRoute(
  target: Handler,
  method: HttpMethod,
  explicitPath?: string,
): void {
  const handler = target;
  const pathInput = explicitPath ?? inferPath(handler);
  const path = pathInput?.startsWith("/") ? pathInput : pathInput ? `/${pathInput}` : undefined;
  if (!path) {
    const name = handler.name || "<anonymous>";
    throw new Error(`Route for "${name}" is missing a path. Provide one or enable name inference.`);
  }
  const current = routeMeta.get(handler) ?? {};
  routeMeta.set(handler, {
    ...current,
    method,
    path,
  });
}

export function registerFirebaseAuth(target: Handler, cfg?: FirebaseAuthOptions): void {
  const handler = target;
  const current = routeMeta.get(handler) ?? {};
  routeMeta.set(handler, {
    ...current,
    auth: {
      type: "firebase",
      ...cfg,
    },
  });
}

export function registerParameter(target: Handler, meta: ParameterMetadata): void {
  const handler = target;
  const list = parameterMeta.get(handler) ?? [];
  list.push(meta);
  list.sort((a, b) => a.index - b.index);
  parameterMeta.set(handler, list);
}

export function getRegisteredRoutes(): RouteRegistryEntry[] {
  const routes: RouteRegistryEntry[] = [];
  for (const [handler, meta] of routeMeta.entries()) {
    if (!meta.method || !meta.path) {
      const name = handler.name || "<anonymous>";
      throw new Error(`Route for "${name}" is incomplete. Ensure it has an HTTP method decorator.`);
    }
    routes.push({
      handler,
      method: meta.method,
      path: meta.path,
      auth: meta.auth,
      parameters: [...(parameterMeta.get(handler) ?? [])],
    });
  }
  return routes;
}

function inferPath(handler: Handler): string | undefined {
  if (!options.inferPathFromName) {
    return undefined;
  }
  const name = handler.name;
  if (!name) {
    return undefined;
  }
  const slug = name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
  return slug ? `/${slug}` : undefined;
}

export function getRouteOptions(): RouteOptions {
  return { ...options };
}

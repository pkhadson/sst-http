import { match, type MatchFunction } from "path-to-regexp";
import { normalizeRouterPath } from "./paths";
import type { HttpMethod, RouteRegistryEntry } from "../core/types";

type RouteMatcher = {
  entry: RouteRegistryEntry;
  matcher: MatchFunction<Record<string, string | string[]>>;
};

export type RouterMatch =
  | {
      type: "found";
      entry: RouteRegistryEntry;
      params: Record<string, string>;
    }
  | {
      type: "method-not-allowed";
      allowedMethods: HttpMethod[];
    };

export class Router {
  private readonly routes: RouteMatcher[];

  constructor(entries: RouteRegistryEntry[]) {
    this.routes = entries.map((entry) => ({
      entry,
      matcher: match(normalizeRouterPath(entry.path), { decode: decodeURIComponent }),
    }));
  }

  find(method: HttpMethod, pathname: string): RouterMatch | undefined {
    const allowed = new Set<HttpMethod>();

    for (const route of this.routes) {
      const result = route.matcher(pathname);
      if (!result) {
        continue;
      }

      allowed.add(route.entry.method);

      if (route.entry.method === method) {
        return {
          type: "found",
          entry: route.entry,
          params: normalizeParams(result.params),
        };
      }
    }

    if (allowed.size > 0) {
      return {
        type: "method-not-allowed",
        allowedMethods: [...allowed],
      };
    }

    return undefined;
  }
}

function normalizeParams(params: Record<string, string | string[]>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    normalized[key] = Array.isArray(value) ? value[value.length - 1] ?? "" : value;
  }
  return normalized;
}

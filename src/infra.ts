import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RoutesManifest } from "./core/types";
import { wireEventsFromManifest, createBus, getBus } from "./bus/infra";
import {
  httpApiAdapter,
  restApiAdapter,
  wireRoutesFromManifest,
  type EnsureJwtAuthorizer,
  type RegisterRoute,
  type RegisterRouteConfig,
} from "./http/infra";

export { httpApiAdapter, restApiAdapter, createBus, getBus };
export type { EnsureJwtAuthorizer, RegisterRoute, RegisterRouteConfig };

export function wireApiFromManifest(
  manifest: RoutesManifest,
  opts: {
    handler: unknown;
    firebaseProjectId: string;
    registerRoute: RegisterRoute;
    ensureJwtAuthorizer: EnsureJwtAuthorizer;
    buses?: Parameters<typeof wireEventsFromManifest>[1]["buses"];
  },
): void {
  if (!manifest || !Array.isArray(manifest.routes)) {
    throw new Error("Invalid routes manifest");
  }

  wireRoutesFromManifest(manifest, {
    handler: opts.handler,
    firebaseProjectId: opts.firebaseProjectId,
    registerRoute: opts.registerRoute,
    ensureJwtAuthorizer: opts.ensureJwtAuthorizer,
  });

  wireEventsFromManifest(manifest.events, {
    handler: opts.handler,
    buses: opts.buses,
  });
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

export type {
  RoutesManifest,
  RoutesManifestRoute,
  RoutesManifestAuth,
  RoutesManifestEvent,
} from "./core/types";

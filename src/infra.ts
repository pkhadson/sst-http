import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RoutesManifest } from "./core/types";
import { wireEventsFromManifest } from "./bus/infra";
import {
  httpApiAdapter,
  restApiAdapter,
  wireRoutesFromManifest,
  type EnsureJwtAuthorizer,
  type RegisterRoute,
  type RegisterRouteConfig,
} from "./http/infra";
import { ensureSstAws } from "./core/infra";

export { httpApiAdapter, restApiAdapter };
export type { EnsureJwtAuthorizer, RegisterRoute, RegisterRouteConfig };

export function wireApiFromManifest(
  manifest: RoutesManifest,
  opts: {
    handler: unknown;
    firebaseProjectId?: string;
    registerRoute: RegisterRoute;
    ensureJwtAuthorizer?: EnsureJwtAuthorizer;
  },
): void {
  if (!manifest || !Array.isArray(manifest.routes)) {
    throw new Error("Invalid routes manifest");
  }

  setHandlerBus(opts.handler);

  wireRoutesFromManifest(manifest, {
    handler: opts.handler,
    firebaseProjectId: opts.firebaseProjectId,
    registerRoute: opts.registerRoute,
    ensureJwtAuthorizer: opts.ensureJwtAuthorizer,
  });

  wireEventsFromManifest(manifest.events, {
    handler: opts.handler,
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

let publisherHandlerCount = 0;

export function setHandlerBus(handler: unknown): void {
  const aws = ensureSstAws();
  new aws.iam.RolePolicy("PublisherHandlerPolicy" + (publisherHandlerCount ? publisherHandlerCount : ""), {
    role: (handler as { nodes: { role: { name: string } } }).nodes.role.name,
    policy: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: ["events:PutEvents"],
          Resource: ["*"],
          Effect: "Allow",
        },
      ],
    },
  });

  publisherHandlerCount++;

}

export type {
  RoutesManifest,
  RoutesManifestRoute,
  RoutesManifestAuth,
  RoutesManifestEvent,
} from "./core/types";

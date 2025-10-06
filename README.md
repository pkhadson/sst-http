# sst-http

Decorator-based HTTP routing for [SST v3](https://sst.dev) that keeps your app on a single Lambda handler while still wiring routes directly into API Gateway. Build routes with NestJS-style decorators, secure them with Firebase JWT authorizers, and generate an infra-ready manifest from your source.

## Install

```bash
pnpm add sst-http
```

## Define Routes

Create routed functions anywhere in your project – no controller classes required.

```ts
// src/routes/users.ts
import { Get, Post, FirebaseAuth, json } from "sst-http";

@Get("/users/:id")
@FirebaseAuth()
export async function getUser({ params }: { params: { id: string } }) {
  return json(200, { id: params.id });
}

@Post("/users")
@FirebaseAuth({ optional: false })
export async function createUser({ body }: { body: { email: string } }) {
  return json(201, { ok: true, email: body.email });
}
```

Enable name-based inference once at bootstrap if you prefer omitting explicit path strings:

```ts
import { configureRoutes } from "sst-http";

configureRoutes({ inferPathFromName: true });
```

Parameter decorators are available when you want granular control:

```ts
import { Body, Post } from "sst-http";
import { z } from "zod";

const CreateTodo = z.object({ title: z.string().min(1) });

@Post("/todos")
export function createTodo(@Body(CreateTodo) payload: z.infer<typeof CreateTodo>) {
  // payload is validated JSON
  return { statusCode: 201, body: JSON.stringify(payload) };
}
```

## Single Lambda Entry

All decorated modules register themselves on import. The single exported handler performs routing and response formatting for both REST and HTTP API Gateway payloads.

```ts
// src/server.ts
import "reflect-metadata";
import { createHandler } from "sst-http";

import "./routes/users";
import "./routes/health";

export const handler = createHandler();
```

Helpers such as `json()`, `text()`, and `noContent()` are available for concise responses, and thrown `HttpError` instances are turned into normalized JSON error payloads.

## Scan & Manifest

Use the CLI to inspect your source tree and materialize a routes manifest for infra wiring.

```bash
pnpm sst-http scan --glob "src/routes/**/*.ts" --out routes.manifest.json
```

Pass `--infer-name` to map routes without explicit paths using the kebab-case function name (matching the runtime `configureRoutes({ inferPathFromName: true })`).

## Firebase JWT Authorizer

Mark a route with `@FirebaseAuth()` and the manifest records it as protected. The core wiring function sets up an API Gateway JWT authorizer that points at your Firebase project (issuer `https://securetoken.google.com/<projectId>` and matching audience). Optional roles and optional-auth flags flow through to the adapter so you can fine-tune scopes.

## Wire API Gateway

`sst-http/infra` ships with a manifest-driven wiring utility plus adapters for HTTP API (ApiGatewayV2) and REST API (ApiGateway). The example below uses the HTTP API adapter inside `sst.config.ts`.

```ts
// sst.config.ts
export default $config({
  app() {
    return { name: "sst-http-demo", home: "aws" };
  },
  async run() {
    const {
      loadRoutesManifest,
      wireApiFromManifest,
      httpApiAdapter,
    } = await import("sst-http/infra");

    const manifest = loadRoutesManifest("routes.manifest.json");
    const { api, registerRoute, ensureJwtAuthorizer } = httpApiAdapter({
      apiName: "Api",
      apiArgs: {
        transform: {
          route: {
            handler: {
              runtime: "nodejs20.x",
              timeout: "10 seconds",
              memory: "512 MB",
            },
          },
        },
      },
    });

    wireApiFromManifest(manifest, {
      handlerFile: "src/server.handler",
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID!,
      registerRoute,
      ensureJwtAuthorizer,
    });

    return { ApiUrl: api.url };
  },
});
```

Swap in `restApiAdapter` if you prefer API Gateway REST APIs—the wiring contract is identical.

## Publishing

```bash
npm login
npm version patch
pnpm run release
```

The release script builds the ESM/CJS bundles via `tsup` before publishing.

## License

MIT

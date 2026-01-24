# sst-http

Decorator-based HTTP routing and EventBridge helpers for SST v3. Keep a single Lambda for your API, scan routes into a manifest, and wire everything into API Gateway. The bus helpers let you subscribe handlers with `@On()` and publish events from anywhere.

## Install

```bash
pnpm add sst-http
```

## Import style

You can keep using the root entrypoint, or import by domain:

```ts
import { createHandler, Get, Post } from "sst-http/http";
import { On, publish } from "sst-http/bus";

// Root entrypoint also works
import { createHandler as createHttpHandler } from "sst-http";
```

## Examples

The repo ships three SST v3 examples under `examples/`:

- `examples/http`: four HTTP routes (path param, query string, JSON body, plus a ping route).
- `examples/bus-publisher`: exposes `GET /` and publishes a `demo.created` event to the bus.
- `examples/bus-receiver`: a single `@On("demo.created")` handler that receives the event.

To run one of them:

```bash
cd examples/http
pnpm install
pnpm run routes:scan
pnpm run dev
```

For the bus pair, you can deploy either example in any order since events target the default bus.

## HTTP routes

Create routed functions anywhere in your project—no controllers required.

```ts
// src/routes/users.ts
import { Get, Post, FirebaseAuth, json } from "sst-http/http";

export class UserRoutes {
  @Get("/users/{id}")
  @FirebaseAuth()
  static async getUser({ params }: { params: { id: string } }) {
    return json(200, { id: params.id });
  }

  @Post("/users")
  @FirebaseAuth({ optional: false })
  static async createUser({ body }: { body: { email: string } }) {
    return json(201, { ok: true, email: body.email });
  }
}

export const getUser = UserRoutes.getUser;
export const createUser = UserRoutes.createUser;
```

Enable name-based inference if you prefer omitting explicit paths:

```ts
import { configureRoutes } from "sst-http/http";

configureRoutes({ inferPathFromName: true });
```

### Parameter decorators

```ts
import { Body, Post } from "sst-http/http";
import { z } from "zod/v4";

const CreateTodo = z.object({ title: z.string().min(1) });

export class TodoRoutes {
  @Post("/todos")
  static createTodo(@Body(CreateTodo) payload: z.infer<typeof CreateTodo>) {
    return { statusCode: 201, body: JSON.stringify(payload) };
  }
}

export const createTodo = TodoRoutes.createTodo;
```

> **Note**
> API Gateway route keys expect `{param}` placeholders. The router accepts `{param}` or `:param` at runtime, but manifests and infra wiring emit `{param}` so your deployed routes line up with AWS.

## Single Lambda entry

All decorated modules register themselves on import. The handler handles routing for both REST and HTTP API Gateway payloads.

```ts
// src/server.ts
import "reflect-metadata";
import { createHandler } from "sst-http/http";

import "./routes/users";
import "./routes/health";

export const handler = createHandler();
```

Helpers such as `json()`, `text()`, and `noContent()` are available for concise responses. Throw `HttpError` to return a normalized JSON error payload.

## Event bus

Use `@On()` to register EventBridge handlers and `publish()` to emit events. Handlers decorated with `@On()` are automatically subscribed to the default EventBridge bus when you call `wireApiFromManifest()` with a manifest that includes events.

```ts
// src/events/user-events.ts
import { On } from "sst-http/bus";

export class UserEvents {
  @On("user.created")
  static async onUserCreated(detail: { id: string }) {
    console.log("New user", detail.id);
  }
}

export const onUserCreated = UserEvents.onUserCreated;
```

```ts
import { publish } from "sst-http/bus";

await publish("user.created", { id: "123" });
```

`publish()` signs requests with the current AWS credentials and requires `AWS_REGION`/`AWS_DEFAULT_REGION` in the environment.

## Scan & manifest

Use the CLI to inspect your source tree and materialize a manifest for infra wiring.

```bash
pnpm sst-http scan --glob "src/**/*.ts" --out routes.manifest.json
```

Pass `--infer-name` to map routes without explicit paths using the kebab-case function name (matching `configureRoutes({ inferPathFromName: true })`). When `@On()` is used, events are emitted into the same manifest under `events`.

## Firebase JWT authorizer

Mark a route with `@FirebaseAuth()` and the manifest records it as protected. The wiring utilities configure an API Gateway JWT authorizer using:

- Issuer: `https://securetoken.google.com/<projectId>`
- Audience: `<projectId>`

Optional roles and optional-auth flags flow into the adapter so you can fine-tune scopes.

## Wire API Gateway + EventBridge

`sst-http/infra` ships with a manifest-driven wiring utility plus adapters for HTTP API (ApiGatewayV2) and REST API (ApiGateway). The example below wires all routes to a single Lambda function inside `sst.config.ts` and automatically connects event subscriptions from the same manifest.

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
    const { api, registerRoute, ensureJwtAuthorizer } = httpApiAdapter({ apiName: "Api" });

    const handler = new sst.aws.Function("Handler", {
      handler: "src/server.handler",
      runtime: "nodejs20.x",
      timeout: "10 seconds",
      memory: "512 MB",
    });

    wireApiFromManifest(manifest, {
      handler,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID!,
      registerRoute,
      ensureJwtAuthorizer,
    });

    return { ApiUrl: api.url };
  },
});
```

When the manifest contains events (from `@On()` decorators), handlers are automatically subscribed to the default EventBridge bus. Swap in `restApiAdapter` if you prefer API Gateway REST APIs—the wiring contract is identical.

## Publishing

```bash
npm login
npm version patch
pnpm run release
```

## License

MIT

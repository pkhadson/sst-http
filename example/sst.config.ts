/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "example",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    const {
      loadRoutesManifest,
      wireApiFromManifest,
      httpApiAdapter,
    } = await import("sst-http/infra");

    const manifest = loadRoutesManifest("routes.manifest.json");

    const api = new sst.aws.ApiGatewayV2("ExampleApi", {
      transform: {
        route: {
          handler: {
            runtime: "nodejs20.x",
            timeout: "10 seconds",
            memory: "512 MB",
          },
        },
      },
    });

    const { registerRoute, ensureJwtAuthorizer } = httpApiAdapter({ api });

    wireApiFromManifest(manifest, {
      handlerFile: "src/server.handler",
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "",
      registerRoute,
      ensureJwtAuthorizer,
    });

    return {
      ApiUrl: api.url,
    };
  },
});

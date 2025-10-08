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

    const singleHandler = new sst.aws.Function("SingleHandler", {
      handler: "src/server.handler",
      runtime: "nodejs20.x",
      timeout: "10 seconds",
      memory: "512 MB",
    });

    const manifest = loadRoutesManifest("routes.manifest.json");

    const api = new sst.aws.ApiGatewayV2("ExampleApi");

    const { registerRoute, ensureJwtAuthorizer } = httpApiAdapter({ api });

    wireApiFromManifest(manifest, {
      handler: singleHandler,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "",
      registerRoute,
      ensureJwtAuthorizer,
      
    });

    return {
      ApiUrl: api.url,
    };
  },
});

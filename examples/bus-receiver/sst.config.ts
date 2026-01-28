/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "sst-http-bus-receiver",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    const { loadRoutesManifest, wireApiFromManifest } = await import("sst-http/infra");

    const handler = new sst.aws.Function("ReceiverHandler", {
      handler: "src/server.handler",
      runtime: "nodejs20.x",
      timeout: "10 seconds",
      memory: "512 MB",
    });

    const manifest = loadRoutesManifest("routes.manifest.json");

    wireApiFromManifest(manifest, {
      handler,
      registerRoute: (_method, _path, _config) => {},
    });

    return {
      HandlerArn: handler.arn,
    };
  },
});

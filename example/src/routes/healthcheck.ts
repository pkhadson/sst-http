import { Get, json } from "sst-http";

export class HealthRoutes {
  @Get("/healthcheck")
  static healthcheck() {
    return json(200, { status: "ok" });
  }
}

export const healthcheck = HealthRoutes.healthcheck;

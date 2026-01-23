import { Get, json } from "sst-http/http";
import { publish } from "sst-http/bus";

export class PublisherRoutes {
  @Get("/")
  static async publishEvent() {
    await publish("demo.created", {
      message: "Hello from bus-publisher",
    });

    return json(200, { ok: true });
  }
}

export const publishEvent = PublisherRoutes.publishEvent;

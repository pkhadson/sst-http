import { Body, Get, Param, Post, Query, json } from "sst-http/http";

type EchoPayload = {
  message: string;
};

export class HttpRoutes {
  @Get("/ping")
  static ping() {
    return json(200, { ok: true });
  }

  @Get("/users/{id}")
  static getUser(@Param("id") id: string) {
    return json(200, { id });
  }

  @Get("/search")
  static search(@Query("q") query?: string) {
    return json(200, { query: query ?? null });
  }

  @Post("/echo")
  static echo(@Body() body: EchoPayload) {
    return json(200, { body });
  }
}

export const ping = HttpRoutes.ping;
export const getUser = HttpRoutes.getUser;
export const search = HttpRoutes.search;
export const echo = HttpRoutes.echo;

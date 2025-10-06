import { Get, Post, json } from "sst-http";

type ExampleContext = {
  params: {
    id: string;
  };
};

export class ExampleRoutes {
  @Post("/example/{id}")
  static createExample({ params }: ExampleContext) {
    return json(200, { id: params.id });
  }

  @Get("/example/{id}")
  static getExample({ params }: ExampleContext) {
    return json(200, { id: params.id });
  }
}

export const createExample = ExampleRoutes.createExample;
export const getExample = ExampleRoutes.getExample;

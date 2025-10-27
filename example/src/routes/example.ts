import { Auth, FirebaseAuth, FirebaseClaims, Get, Post, json } from "sst-http";

type ExampleContext = {
  params: {
    id: string;
  };
};

const instanceId = Math.random().toString(36).substring(2, 15);

export class ExampleRoutes {
  @Post("/example/{id}")
  static createExample({ params }: ExampleContext) {
    return json(200, { id: params.id, instanceId });
  }

  @Get("/example/{id}")
  static getExample({ params }: ExampleContext) {
    return json(200, { id: params.id, instanceId });
  }

  @Get('/auth/example')
  @FirebaseAuth()
  static getAuthExample(@Auth() auth: FirebaseClaims) {
    return json(200, { instanceId, auth });
  }
}

export const createExample = ExampleRoutes.createExample;
export const getExample = ExampleRoutes.getExample;

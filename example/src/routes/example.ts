import { Auth, FirebaseAuth, FirebaseClaims, Get, Header, Param, Post, Query, json } from "sst-http";

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

  @Get('/auth/example')
  @FirebaseAuth()
  static getAuthExample(@Auth() auth: FirebaseClaims) {
    return json(200, { instanceId, auth });
  }

  @Get('/example/header')
  static getExampleWithHeader(@Header('x-example-header') header: string) {
    return json(200, { instanceId, header });
  }

  @Get('/example/:id')
  static getExampleWithParam(@Param('id') id: string) {
    return json(200, { instanceId, id });
  }

  @Get('/example/query')
  static getExampleWithQuery(@Query('name') name: string) {
    return json(200, { instanceId, name });
  }

  @Get("/example/{id}")
  static getExample({ params }: ExampleContext) {
    return json(200, { id: params.id, instanceId });
  }
}

export const createExample = ExampleRoutes.createExample;
export const getExample = ExampleRoutes.getExample;

/*
GET /example/header
X-Example-Header: example

###
GET /example/param
/example/123

###
GET /example/query
?name=example

###
GET /example/body
{ "name": "example" }
 */

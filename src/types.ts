import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import type { ZodTypeAny } from "zod/v4";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type FirebaseClaims = Record<string, unknown>;

export type FirebaseAuthOptions = {
  roles?: string[];
  optional?: boolean;
};

export type FirebaseAuthMetadata = FirebaseAuthOptions & {
  type: "firebase";
};

export type ParameterType =
  | "body"
  | "query"
  | "param"
  | "headers"
  | "req"
  | "res";

export type ParameterMetadata = {
  index: number;
  type: ParameterType;
  schema?: ZodTypeAny;
};

export type ResponseLike =
  | APIGatewayProxyResult
  | APIGatewayProxyResultV2
  | {
      statusCode: number;
      headers?: Record<string, string>;
      body?: string;
      cookies?: string[];
      isBase64Encoded?: boolean;
    };

export type ResponseHelpers = {
  json: (status: number, data: unknown, headers?: Record<string, string>) => ResponseLike;
  text: (status: number, body: string, headers?: Record<string, string>) => ResponseLike;
  noContent: (headers?: Record<string, string>) => ResponseLike;
};

export type HandlerContext = {
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2;
  lambdaContext: unknown;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  auth?: FirebaseClaims;
  response: ResponseHelpers;
};

export type Handler = (...args: unknown[]) => Promise<ResponseLike | void | undefined> | ResponseLike | void | undefined;

export type RouteRegistryEntry = {
  handler: Handler;
  method: HttpMethod;
  path: string;
  auth?: FirebaseAuthMetadata;
  parameters: ParameterMetadata[];
};

export type RouteOptions = {
  inferPathFromName?: boolean;
};

export type RoutesManifestAuth =
  | { type: "none" }
  | { type: "firebase"; optional?: boolean; roles?: string[] };

export type RoutesManifestRoute = {
  method: HttpMethod;
  path: string;
  auth: RoutesManifestAuth;
};

export type RoutesManifest = {
  routes: RoutesManifestRoute[];
};

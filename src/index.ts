export {
  createHandler,
  json,
  text,
  noContent,
  HttpError,
} from "./runtime";

export {
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Head,
  Options,
  FirebaseAuth,
  Auth,
  Body,
  Query,
  Param,
  Headers,
  Req,
  Res,
} from "./decorators";

export { configureRoutes } from "./registry";

export type {
  Handler,
  HandlerContext,
  HttpMethod,
  FirebaseAuthOptions,
  FirebaseAuthMetadata,
  FirebaseClaims,
  ResponseLike,
  RouteOptions,
} from "./types";

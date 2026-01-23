export {
  createHandler,
  json,
  text,
  noContent,
  HttpError,
  handleError,
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
  Header,
  Req,
  Res,
} from "./decorators";

export { configureRoutes } from "../core/registry";

export type {
  Handler,
  HandlerContext,
  HttpMethod,
  FirebaseAuthOptions,
  FirebaseAuthMetadata,
  FirebaseClaims,
  ResponseLike,
  RouteOptions,
} from "../core/types";

import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { getRegisteredRoutes } from "./registry";
import { Router } from "./router";
import type {
  FirebaseClaims,
  Handler,
  HandlerContext,
  ResponseHelpers,
  ResponseLike,
  RouteRegistryEntry,
  HttpMethod,
} from "./types";

const HTTP_ERROR_MARKER = Symbol.for("sst-http.HttpError");

export class HttpError extends Error {
  readonly statusCode: number;
  readonly headers?: Record<string, string>;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, options?: {
    cause?: unknown;
    headers?: Record<string, string>;
    details?: unknown;
  }) {
    super(message);
    this.name = "HttpError";
    Object.defineProperty(this, HTTP_ERROR_MARKER, { value: true });
    this.statusCode = statusCode;
    this.headers = options?.headers;
    this.details = options?.details;
    if ("cause" in (options ?? {})) {
      (this as Error & { cause?: unknown }).cause = options?.cause;
    }
  }
}

export function json(
  status: number,
  data: unknown,
  headers: Record<string, string> = {},
): ResponseLike {
  return {
    statusCode: status,
    body: JSON.stringify(data ?? null),
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  };
}

export function text(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): ResponseLike {
  return {
    statusCode: status,
    body,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...headers,
    },
  };
}

export function noContent(headers: Record<string, string> = {}): ResponseLike {
  return {
    statusCode: 204,
    headers,
    body: "",
  };
}

type LambdaEvent = APIGatewayProxyEvent | APIGatewayProxyEventV2;

type LambdaResult = APIGatewayProxyResult | APIGatewayProxyResultV2;

export function createHandler() {
  const routes = getRegisteredRoutes();
  const router = new Router(routes);

  return async (event: LambdaEvent, lambdaContext: unknown): Promise<LambdaResult> => {
    const method = extractMethod(event);
    const path = extractPath(event);

    const preferV2 = isHttpApiEvent(event);

    if (!method || !path) {
      return formatResponse(text(400, "Invalid request"), preferV2);
    }

    const normalizedMethod = method.toUpperCase();

    if (!isSupportedMethod(normalizedMethod)) {
      return formatResponse(text(405, "Method Not Allowed"), preferV2);
    }

    const match = router.find(normalizedMethod, path);

    if (!match) {
      return formatResponse(text(404, "Not Found"), preferV2);
    }

    if (match.type === "method-not-allowed") {
      return formatResponse({
        statusCode: 405,
        headers: {
          Allow: match.allowedMethods.join(", "),
        },
        body: "",
      }, preferV2);
    }

    const { entry, params } = match;

    const headers = normalizeHeaders(event.headers ?? {});
    const query = extractQuery(event);

    let bodyValue: unknown = undefined;
    let bodyParsed = false;
    const requiresJson = entry.parameters.some((p) => p.type === "body");

    const ensureBody = () => {
      if (!bodyParsed) {
        bodyValue = parseBody(event, headers, requiresJson);
        bodyParsed = true;
      }
      return bodyValue;
    };

    const ctxResponse: ResponseHelpers = {
      json,
      text,
      noContent,
    };

    const ctx: HandlerContext = {
      event,
      lambdaContext,
      params,
      query,
      body: undefined,
      headers,
      auth: extractAuthClaims(event, entry),
      response: ctxResponse,
    };

    const getBody = (schema?: unknown): unknown => {
      const current = ensureBody();

      if (schema && typeof (schema as { parse?: unknown }).parse === "function") {
        try {
          bodyValue = (schema as { parse: (value: unknown) => unknown }).parse(current);
        } catch (error) {
          throw new HttpError(400, "Body validation failed", { cause: error });
        }
      }

      ctx.body = bodyValue;
      return bodyValue;
    };

    try {
      ctx.body = ensureBody();
      const args = buildHandlerArguments(entry, ctx, getBody);
      const result = await (entry.handler as Handler)(...args);
      if (result === undefined) {
        return formatResponse(noContent(), preferV2);
      }
      return formatResponse(result, preferV2);
    } catch (error) {
      return handleError(error, preferV2);
    }
  };
}

function buildHandlerArguments(
  entry: RouteRegistryEntry,
  ctx: HandlerContext,
  getBody: (schema?: unknown) => unknown,
): unknown[] {
  const maxIndex = entry.parameters.reduce((max, meta) => Math.max(max, meta.index), -1);
  const length = Math.max(entry.handler.length, maxIndex + 1, 1);
  const args = new Array<unknown>(length).fill(undefined);

  for (const meta of entry.parameters) {
    switch (meta.type) {
      case "body": {
        args[meta.index] = getBody(meta.schema);
        break;
      }
      case "query": {
        args[meta.index] = ctx.query;
        break;
      }
      case "param": {
        args[meta.index] = ctx.params;
        break;
      }
      case "headers": {
        args[meta.index] = ctx.headers;
        break;
      }
      case "req": {
        args[meta.index] = ctx.event;
        break;
      }
      case "res": {
        args[meta.index] = ctx.response;
        break;
      }
      case "auth": {
        args[meta.index] = ctx.auth;
        break;
      }
      default: {
        args[meta.index] = ctx;
      }
    }
  }

  for (let i = 0; i < length; i += 1) {
    if (args[i] === undefined) {
      args[i] = ctx;
    }
  }

  return args;
}

function parseBody(
  event: LambdaEvent,
  headers: Record<string, string>,
  forceJson: boolean,
): unknown {
  const raw = extractRawBody(event);
  if (raw === undefined) {
    return undefined;
  }

  const contentType = headers["content-type"];
  const shouldParse = forceJson || isJsonContentType(contentType);

  if (!shouldParse) {
    return raw;
  }

  if (raw.trim() === "") {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new HttpError(400, "Invalid JSON body", { cause: error });
  }
}

function extractRawBody(event: LambdaEvent): string | undefined {
  if (!event.body) {
    return undefined;
  }

  if (event.isBase64Encoded) {
    return Buffer.from(event.body, "base64").toString("utf8");
  }

  return event.body;
}

function isJsonContentType(contentType?: string): boolean {
  if (!contentType) {
    return false;
  }
  return contentType.includes("application/json") || contentType.includes("+json");
}

function normalizeHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "undefined") {
      continue;
    }
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

function extractQuery(event: LambdaEvent): Record<string, string | undefined> {
  const single = (event as APIGatewayProxyEventV2).queryStringParameters ??
    (event as APIGatewayProxyEvent).queryStringParameters ?? {};
  const multi = (event as APIGatewayProxyEvent).multiValueQueryStringParameters ?? {};

  const query: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(single ?? {})) {
    query[key] = value ?? undefined;
  }

  for (const [key, value] of Object.entries(multi ?? {})) {
    if (!value || value.length === 0) {
      continue;
    }
    query[key] = value[value.length - 1];
  }

  return query;
}

function extractMethod(event: LambdaEvent): string | undefined {
  return (
    (event as APIGatewayProxyEventV2).requestContext?.http?.method ||
    (event as APIGatewayProxyEvent).httpMethod ||
    undefined
  ) as string | undefined;
}

function extractPath(event: LambdaEvent): string | undefined {
  return (
    (event as APIGatewayProxyEventV2).rawPath ||
    (event as APIGatewayProxyEvent).path ||
    undefined
  );
}

function extractAuthClaims(event: LambdaEvent, entry: RouteRegistryEntry): FirebaseClaims | undefined {
  if (!entry.auth || entry.auth.type !== "firebase") {
    return undefined;
  }

  const ctxV2 = (event as APIGatewayProxyEventV2).requestContext;
  const ctxV1 = (event as APIGatewayProxyEvent).requestContext;

  const claims = (ctxV2 as { authorizer?: { jwt?: { claims?: FirebaseClaims } } } | undefined)?.authorizer?.jwt?.claims ||
    (ctxV1?.authorizer as { claims?: FirebaseClaims } | undefined)?.claims;

  return claims ?? undefined;
}

function isHttpError(error: unknown): error is HttpError {
  if (!error || typeof error !== "object") {
    return false;
  }
  const marker = (error as Record<symbol, unknown>)[HTTP_ERROR_MARKER] === true;
  const named = (error as { name?: unknown }).name === "HttpError";
  const status = typeof (error as { statusCode?: unknown }).statusCode === "number";
  return status && (marker || named);
}

export function handleError(error: unknown, preferV2: boolean): LambdaResult {
  if (isHttpError(error)) {
    return formatResponse({
      statusCode: error.statusCode,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...error.headers,
      },
      body: error.details ? JSON.stringify({ message: error.message, details: error.details }) : JSON.stringify({ message: error.message }),
    }, preferV2);
  }

  console.error("Unhandled error in sst-http handler", error);
  return formatResponse({
    statusCode: 500,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ message: "Internal Server Error" }),
  }, preferV2);
}

function formatResponse(result: ResponseLike, preferV2: boolean): LambdaResult {
  if (typeof result === "string") {
    result = { statusCode: 200, body: result };
  }

  const normalized = {
    statusCode: result.statusCode ?? 200,
    headers: result.headers,
    body: result.body ?? "",
    cookies: "cookies" in result ? result.cookies : undefined,
    isBase64Encoded: result.isBase64Encoded,
  };

  if (preferV2) {
    const response: APIGatewayProxyResultV2 = {
      statusCode: normalized.statusCode,
      headers: normalized.headers,
      body: normalized.body,
    };
    if (normalized.cookies) {
      response.cookies = normalized.cookies;
    }
    if (typeof normalized.isBase64Encoded === "boolean") {
      response.isBase64Encoded = normalized.isBase64Encoded;
    }
    return response;
  }

  const response: APIGatewayProxyResult = {
    statusCode: normalized.statusCode,
    headers: normalized.headers,
    body: normalized.body,
  };

  if (typeof normalized.isBase64Encoded === "boolean") {
    response.isBase64Encoded = normalized.isBase64Encoded;
  }

  return response;
}

function isHttpApiEvent(event: LambdaEvent): event is APIGatewayProxyEventV2 {
  return (event as APIGatewayProxyEventV2).version === "2.0";
}

const SUPPORTED_METHODS = new Set<HttpMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

function isSupportedMethod(value: string): value is HttpMethod {
  return SUPPORTED_METHODS.has(value as HttpMethod);
}

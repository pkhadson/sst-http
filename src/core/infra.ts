export type UnknownRecord = Record<string, unknown>;
export type Constructor<T = unknown> = new (...args: unknown[]) => T;

export type BusSubscriberArgs = { pattern?: { detailType?: string[] } };

export type BusLike = {
  name?: unknown;
  arn?: unknown;
  subscribe: (name: string, subscriber: unknown, args?: BusSubscriberArgs) => unknown;
};

export type BusConstructor = {
  new (name: string, args?: unknown, opts?: unknown): BusLike;
  get: (name: string, opts?: unknown) => BusLike;
};

export type SstAwsNamespace = {
  ApiGatewayV2: Constructor<unknown>;
  ApiGateway: Constructor<unknown>;
  iam: {
    RolePolicy: Constructor<unknown>;
  };
  Bus: BusConstructor;
};

export type AwsSource = {
  sst?: {
    aws?: unknown;
  };
};

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export function getFunction(value: unknown, key: string): ((...args: unknown[]) => unknown) | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const candidate = value[key];
  return typeof candidate === "function" ? (candidate as (...args: unknown[]) => unknown) : undefined;
}

export function getStringProp(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const candidate = value[key];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

export function ensureRecord(value: unknown, message: string): UnknownRecord {
  if (!isRecord(value)) {
    throw new Error(message);
  }
  return value;
}

export function ensureSstAws(source?: AwsSource): SstAwsNamespace {
  // @ts-expect-error-next-line
  const aws = typeof sst !== "undefined" ? sst.aws : source?.sst?.aws ?? (globalThis as { sst?: { aws?: unknown } }).sst?.aws;
  if (!aws) {
    throw new Error(
      "SST aws namespace is not available. Ensure this code runs within an SST config.",
    );
  }
  return aws;
}

export function resolveHandlerInput(handler: unknown): unknown {
  if (handler === undefined) {
    return undefined;
  }
  if (typeof handler === "string") {
    return handler;
  }
  if (!isRecord(handler)) {
    throw new Error("Unsupported handler type: provide a handler string, FunctionArgs, or a Function ARN/output");
  }
  if ("arn" in handler) {
    return (handler as { arn?: unknown }).arn;
  }
  if (typeof handler.handler === "string") {
    return handler;
  }
  throw new Error("Unsupported handler type: provide a handler string, FunctionArgs, or a Function ARN/output");
}


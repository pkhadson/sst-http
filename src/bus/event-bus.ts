import { createHash, createHmac } from "node:crypto";

const AWS_TARGET = "AWSEvents.PutEvents";
const AWS_SERVICE = "events";
const DEFAULT_SOURCE = "sst-http";

export async function publish(
  event: string,
  message: unknown,
): Promise<void> {
  if (!event) {
    throw new Error("publish() requires an event name.");
  }
  const payload = {
    Entries: [
      {
        EventBusName: 'default',
        Source: DEFAULT_SOURCE,
        DetailType: event,
        Detail: JSON.stringify(message ?? null),
      },
    ],
  };

  console.log(payload)

  await putEventsViaFetch(payload);
}

type PutEventsPayload = {
  Entries: Array<{
    EventBusName: string;
    Source: string;
    DetailType: string;
    Detail: string;
  }>;
};


async function putEventsViaFetch(payload: PutEventsPayload): Promise<void> {
  const region = resolveRegion();
  const creds = resolveCredentials();
  const host = `events.${region}.amazonaws.com`;
  const url = `https://${host}/`;
  const body = JSON.stringify(payload);
  const amzDate = toAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    "content-type": "application/x-amz-json-1.1",
    "x-amz-date": amzDate,
    "x-amz-target": AWS_TARGET,
    host,
  };
  if (creds.sessionToken) {
    headers["x-amz-security-token"] = creds.sessionToken;
  }
  const signedHeaders = getSignedHeaders(headers);
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalizeHeaders(headers),
    signedHeaders,
    sha256(body),
  ].join("\n");
  const scope = `${dateStamp}/${region}/${AWS_SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const signingKey = getSigningKey(creds.secretAccessKey, dateStamp, region, AWS_SERVICE);
  const signature = hmac(signingKey, stringToSign);
  const authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      Authorization: authorization,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`EventBridge PutEvents failed: ${response.status} ${text}`);
  }
}

function resolveRegion(): string {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) {
    throw new Error("AWS region is not set");
  }
  return region;
}

function resolveCredentials(): {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
} {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials are not set");
  }
  return { accessKeyId, secretAccessKey, sessionToken };
}

function toAmzDate(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z",
  ].join("");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function getSigningKey(secret: string, date: string, region: string, service: string): Buffer {
  const kDate = createHmac("sha256", `AWS4${secret}`).update(date, "utf8").digest();
  const kRegion = createHmac("sha256", kDate).update(region, "utf8").digest();
  const kService = createHmac("sha256", kRegion).update(service, "utf8").digest();
  return createHmac("sha256", kService).update("aws4_request", "utf8").digest();
}

function canonicalizeHeaders(headers: Record<string, string>): string {
  return Object.keys(headers)
    .map((key) => key.toLowerCase())
    .sort()
    .map((key) => `${key}:${headers[key].trim()}\n`)
    .join("");
}

function getSignedHeaders(headers: Record<string, string>): string {
  return Object.keys(headers)
    .map((key) => key.toLowerCase())
    .sort()
    .join(";");
}

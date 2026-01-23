import type { RoutesManifestEvent } from "../core/types";
import {
  ensureSstAws,
  getStringProp,
  isRecord,
  resolveHandlerInput,
  type AwsSource,
  type BusLike,
  type SstAwsNamespace,
} from "../core/infra";

type BusInput = BusLike | BusLike[] | Record<string, BusLike>;

const MAX_SUBSCRIBER_NAME_LENGTH = 60;

export function getBus(): BusLike {
  const aws = ensureSstAws();
  return aws.Bus.get("default", "default");
}

export function wireEventsFromManifest(
  events: RoutesManifestEvent[] | undefined,
  opts: {
    handler: unknown;
    buses?: BusInput;
    source?: AwsSource;
  },
): void {
  if (!events || events.length === 0) {
    return;
  }
  const aws = ensureSstAws(opts.source);
  const busMap = normalizeBusInput(opts.buses);
  const subscriber = resolveHandlerInput(opts.handler);
  const seen = new Set<string>();

  for (const event of events) {
    const key = `default:${event.event}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const bus = resolveBusForEvent(busMap, aws);
    const subscriberName = buildSubscriberName(event.event);
    subscribeToBus(bus, subscriberName, subscriber, event.event);
  }
}

function normalizeBusInput(input?: BusInput): Map<string, BusLike> | undefined {
  if (!input) {
    return undefined;
  }
  const map = new Map<string, BusLike>();

  if (Array.isArray(input)) {
    for (const bus of input) {
      const key = getBusKey(bus);
      if (key) {
        map.set(key, bus);
      }
    }
    if (map.size === 1 && !map.has("default")) {
      const [bus] = map.values();
      map.set("default", bus);
    }
    return map;
  }

  if (isBusRecord(input)) {
    for (const [key, bus] of Object.entries(input)) {
      map.set(key, bus);
    }
    return map;
  }

  const key = getBusKey(input) ?? "default";
  map.set(key, input);
  return map;
}

function isBusRecord(input: BusInput): input is Record<string, BusLike> {
  return !Array.isArray(input) && isRecord(input) && !("subscribe" in input);
}

function getBusKey(bus: BusLike): string | undefined {
  return getStringProp(bus, "name") ?? getStringProp(bus, "constructorName");
}

function resolveBusForEvent(
  busMap: Map<string, BusLike> | undefined,
  aws: SstAwsNamespace,
): BusLike {
  if (busMap && busMap.size > 0) {
    const direct = busMap.get("default");
    if (direct) {
      return direct;
    }
    if (busMap.size === 1) {
      return busMap.values().next().value as BusLike;
    }
  }
  return aws.Bus.get("default", "default");
}

function subscribeToBus(
  bus: BusLike,
  subscriberName: string,
  subscriber: unknown,
  eventName: string,
): void {
  if (typeof bus.subscribe !== "function") {
    throw new Error("Bus instance does not support subscribe().");
  }
  bus.subscribe(subscriberName, subscriber, {
    pattern: {
      detailType: [eventName],
    },
  });
}

function buildSubscriberName(eventName: string): string {
  const base = `default-${eventName}`.replace(/[^a-zA-Z0-9]/g, "");
  if (base.length === 0) {
    return "Event";
  }
  return base.length > MAX_SUBSCRIBER_NAME_LENGTH
    ? base.slice(0, MAX_SUBSCRIBER_NAME_LENGTH)
    : base;
}


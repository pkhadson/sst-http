import type { RoutesManifestEvent } from "../core/types";
import {
  ensureSstAws,
  resolveHandlerInput,
  type AwsSource,
  type BusLike,
} from "../core/infra";

const MAX_SUBSCRIBER_NAME_LENGTH = 60;

export function wireEventsFromManifest(
  events: RoutesManifestEvent[] | undefined,
  opts: {
    handler: unknown;
    source?: AwsSource;
  },
): void {
  if (!events || events.length === 0) {
    return;
  }
  const aws = ensureSstAws(opts.source);
  const subscriber = resolveHandlerInput(opts.handler);
  const seen = new Set<string>();

  for (const event of events) {
    const key = `default:${event.event}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const bus = aws.Bus.get("default", "default");
    const subscriberName = buildSubscriberName(event.event);
    subscribeToBus(bus, subscriberName, subscriber, event.event);
  }
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


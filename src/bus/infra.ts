import type { RoutesManifestEvent } from "../core/types";
import {
  ensureSstAws,
  resolveHandlerInput,
  type AwsSource,
  type BusLike,
  type SstAwsNamespace,
} from "../core/infra";

const MAX_SUBSCRIBER_NAME_LENGTH = 60;

let bus:BusLike;

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
  const seen = new Map<string, number>();

  for (const event of events) {
    const delay = event.delay ?? 0;
    if (!Number.isInteger(delay) || delay < 0 || delay > 900) {
      throw new Error(`@On("${event.event}") delay must be an integer from 0 to 900 seconds.`);
    }
    if (seen.has(event.event)) {
      if (seen.get(event.event) !== delay) {
        throw new Error(`@On("${event.event}") cannot mix different delay values.`);
      }
      continue;
    }
    if (!bus) bus = aws.Bus.get("default", "default");
    seen.set(event.event, delay);
    const subscriberName = buildSubscriberName(event.event);
    if (delay > 0) {
      subscribeToBusWithDelay(aws, bus, subscriberName, subscriber, event.event, delay);
    } else {
      subscribeToBus(bus, subscriberName, subscriber, event.event);
    }
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

function subscribeToBusWithDelay(
  aws: SstAwsNamespace,
  bus: BusLike,
  subscriberName: string,
  subscriber: unknown,
  eventName: string,
  delay: number,
): void {
  if (typeof bus.subscribeQueue !== "function") {
    throw new Error("Bus instance does not support subscribeQueue().");
  }
  const queue = new aws.Queue(`${subscriberName}DelayQueue`, {
    delay: `${delay} seconds`,
  });
  bus.subscribeQueue(subscriberName, queue, {
    pattern: {
      detailType: [eventName],
    },
  });
  queue.subscribe(subscriber);
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

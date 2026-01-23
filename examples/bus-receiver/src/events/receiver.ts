import { On } from "sst-http/bus";

type DemoCreatedDetail = {
  message?: string;
};

export class BusReceiver {
  @On("demo.created")
  static async handleDemoCreated(detail: DemoCreatedDetail) {
    console.log("Received demo.created", detail);

    const random = Math.round(Math.random() * 100);

    await   fetch(`http://sst-http.requestcatcher.com/received?random=${random}`)

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Demo created" }),
    };
  }
}

export const handleDemoCreated = BusReceiver.handleDemoCreated;

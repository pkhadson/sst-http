import "reflect-metadata";
import { createHandler } from "sst-http";

import "./routes/example";
import "./routes/healthcheck";

export const handler = createHandler();

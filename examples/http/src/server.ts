import "reflect-metadata";
import { createHandler } from "sst-http/http";

import "./routes/http";

export const handler = createHandler();

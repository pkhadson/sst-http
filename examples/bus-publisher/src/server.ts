import "reflect-metadata";
import { createHandler } from "sst-http/http";

import "./routes/publish";

export const handler = createHandler();

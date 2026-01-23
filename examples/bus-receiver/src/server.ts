import "reflect-metadata";
import { createHandler } from "sst-http/http";

import "./events/receiver";

export const handler = createHandler();

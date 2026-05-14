#!/usr/bin/env node
import "dotenv/config";

import { createApp } from "./server.js";
import { loadBridgeConfig } from "./config.js";

const config = loadBridgeConfig();
const app = await createApp();

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info({ host: config.host, port: config.port }, "Commander CommandCode Bridge listening");
} catch (error) {
  app.log.error(error, "Failed to start Commander CommandCode Bridge");
  process.exit(1);
}

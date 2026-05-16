#!/usr/bin/env node
import "dotenv/config";

import { createRouterApp, loadRouterConfig } from "./router.js";

const config = loadRouterConfig();
const app = await createRouterApp({ config });

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    {
      host: config.host,
      port: config.port,
      backends: config.backends.map((backend) => ({ id: backend.id, baseUrl: backend.baseUrl })),
    },
    "CommandCode Router listening",
  );
} catch (error) {
  app.log.error(error, "Failed to start CommandCode Router");
  process.exit(1);
}

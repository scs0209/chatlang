#!/usr/bin/env node
import { startBridge } from "./server.mjs";

const port = Number(process.env.CHATLANG_BRIDGE_PORT ?? 3847);
startBridge(port);

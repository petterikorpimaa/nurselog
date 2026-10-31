import {
  sessionFixture
} from "./chunk-JC63PFSV.js";
import {
  readSpoolDays
} from "./chunk-L5UAFSAH.js";

// src/spool/fixture-worker.ts
import { parentPort, workerData } from "worker_threads";
var job = workerData;
var warnings = [];
var answer;
try {
  const fixture = sessionFixture(readSpoolDays(job.dir, (message) => warnings.push(message)), job.sessionId, job.config);
  answer = fixture ? { fixture, warnings } : { warnings };
} catch (error) {
  answer = { warnings, error: error instanceof Error ? error.message : String(error) };
}
parentPort?.postMessage(answer);

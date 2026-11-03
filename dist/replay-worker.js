import {
  replayHistory
} from "./chunk-DGVUHDJF.js";
import "./chunk-2S7VCMPW.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

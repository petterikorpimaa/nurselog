import {
  replayHistory
} from "./chunk-4YEIGH7M.js";
import "./chunk-YQE4KOST.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

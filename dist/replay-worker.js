import {
  replayHistory
} from "./chunk-7RCTHUHY.js";
import "./chunk-L5UAFSAH.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

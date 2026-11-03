import {
  replayHistory
} from "./chunk-VXD3V7SF.js";
import "./chunk-EEWYYZR3.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

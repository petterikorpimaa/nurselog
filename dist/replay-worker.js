import {
  replayHistory
} from "./chunk-3K4PR63I.js";
import "./chunk-IH6V7M2D.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

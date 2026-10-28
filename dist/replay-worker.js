import {
  replayHistory
} from "./chunk-4VI3FZIO.js";
import "./chunk-KSQVLKAZ.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

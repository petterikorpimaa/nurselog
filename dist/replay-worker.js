import {
  replayHistory
} from "./chunk-56YFWDRO.js";
import "./chunk-5ZNMGXDF.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

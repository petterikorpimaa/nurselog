import {
  replayHistory
} from "./chunk-EY6E4WUD.js";
import "./chunk-MDIXO4FB.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

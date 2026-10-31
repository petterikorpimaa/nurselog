import {
  replayHistory
} from "./chunk-73HFVODL.js";
import "./chunk-UTPB24LM.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

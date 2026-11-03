import {
  replayHistory
} from "./chunk-3LOJCZZY.js";
import "./chunk-TGKDM7PV.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

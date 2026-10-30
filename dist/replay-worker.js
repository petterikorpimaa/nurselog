import {
  replayHistory
} from "./chunk-PIJFT6QM.js";
import "./chunk-255XBBTU.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

import {
  replayHistory
} from "./chunk-KT5JD7DT.js";
import "./chunk-Y3WLG3IJ.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

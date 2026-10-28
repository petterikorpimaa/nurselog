import {
  replayHistory
} from "./chunk-OMBC2G6E.js";
import "./chunk-OHFJPS3R.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

import {
  replayHistory
} from "./chunk-OTGMYKOM.js";
import "./chunk-LKOSYIQD.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

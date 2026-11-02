import {
  replayHistory
} from "./chunk-DRDUSXK5.js";
import "./chunk-NNCN4HNI.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

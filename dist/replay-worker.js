import {
  replayHistory
} from "./chunk-AOH2OHDW.js";
import "./chunk-65LEEKVG.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

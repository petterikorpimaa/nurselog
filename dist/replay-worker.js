import {
  replayHistory
} from "./chunk-DFA2TP4S.js";
import "./chunk-XWSOY4J2.js";

// src/spool/replay-worker.ts
import { parentPort, workerData } from "worker_threads";
var answer = await replayHistory(workerData);
parentPort?.postMessage(answer, [answer.image]);

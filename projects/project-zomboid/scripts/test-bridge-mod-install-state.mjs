import assert from "node:assert/strict";
import { resolveSuccessfulBridgeModInstallState } from "../src/features/live-bridge/bridge-mod-install-store.ts";

assert.equal(resolveSuccessfulBridgeModInstallState({
  gameRunning: false,
  filesChanged: true,
  bridgeActive: true,
}), "installed");

assert.equal(resolveSuccessfulBridgeModInstallState({
  gameRunning: true,
  filesChanged: true,
  bridgeActive: false,
}), "restart_required");

assert.equal(resolveSuccessfulBridgeModInstallState({
  previousState: "restart_required",
  gameRunning: false,
  filesChanged: false,
  bridgeActive: true,
}), "installed");

assert.equal(resolveSuccessfulBridgeModInstallState({
  previousState: "restart_required",
  gameRunning: true,
  filesChanged: false,
  bridgeActive: true,
}), "restart_required");

assert.equal(resolveSuccessfulBridgeModInstallState({
  previousState: "installed",
  gameRunning: true,
  filesChanged: false,
  bridgeActive: true,
}), "installed");

assert.equal(resolveSuccessfulBridgeModInstallState({
  previousState: "installed",
  gameRunning: false,
  filesChanged: false,
  bridgeActive: false,
}), "restart_required");

console.log("Bridge mod install state tests passed.");

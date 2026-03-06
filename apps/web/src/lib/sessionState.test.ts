import { describe, expect, it } from "vitest";
import { computeNextState, createInitialSessionModel } from "./sessionState";

describe("sessionState", () => {
  it("starts DISCONNECTED", () => {
    const model = createInitialSessionModel();
    expect(computeNextState(model)).toBe("DISCONNECTED");
  });

  it("becomes READY when mic + camera are granted", () => {
    const model = createInitialSessionModel();
    model.micGranted = true;
    model.cameraGranted = true;
    expect(computeNextState(model)).toBe("READY");
  });

  it("becomes ERROR when error is present", () => {
    const model = createInitialSessionModel();
    model.error = { message: "fail" };
    expect(computeNextState(model)).toBe("ERROR");
  });
});
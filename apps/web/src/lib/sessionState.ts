export type SessionState =
  | "DISCONNECTED"
  | "READY"
  | "RECORDING"
  | "ERROR";

export type SessionError = {
  message: string;
};

export type SessionModel = {
  state: SessionState;
  micGranted: boolean;
  cameraGranted: boolean;
  error?: SessionError;
};

export function createInitialSessionModel(): SessionModel {
  return {
    state: "DISCONNECTED",
    micGranted: false,
    cameraGranted: false,
  };
}

export function computeNextState(model: SessionModel): SessionState {
  if (model.error) return "ERROR";
  if (model.micGranted && model.cameraGranted) return "READY";
  return "DISCONNECTED";
}
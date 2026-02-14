export type AuthMode = "NONE" | "LOGIN" | "REGISTER" | "LOGOUT";

export type LoginStep =
  | "EMAIL"
  | "PASSWORD"
  | "FACE"
  | "VOICE_PIN"
  | "SUCCESS";


export type RegisterStep =
  | "EMAIL"
  | "CONFIRM_EMAIL"
  | "PASSWORD"
  | "CONFIRM_PASSWORD"
  | "APP_PASSWORD"
  | "CONFIRM_APP_PASSWORD"
  | "FACE"
  | "VOICE_PIN"
  | "CONFIRM_VOICE_PIN"
  | "COMPLETE";


export interface AuthSession {
  mode: AuthMode;
  step: LoginStep | RegisterStep | null;
  retries: number;
  tempData: Record<string, any>;
}

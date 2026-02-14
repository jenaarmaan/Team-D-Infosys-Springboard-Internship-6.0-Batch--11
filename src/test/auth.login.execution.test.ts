import { loginWithBiometrics, logout } from "@/auth/authController"
import { authState } from "@/auth/authStateMachine"

describe("Auth Execution — Voice-First Login", () => {
  beforeEach(() => {
    logout()
  })

  test("fails when face verification fails", async () => {
    const result = await loginWithBiometrics({
      inputFace: null,
      storedFace: {} as Blob,
      inputPin: "1234",
      storedPinHash: "hash",
      userId: "user-1",
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe("NO_FACE")
    expect(authState.isAuthenticated).toBe(false)
  })

  test("fails when PIN verification fails", async () => {
    const result = await loginWithBiometrics({
      inputFace: {} as Blob,
      storedFace: {} as Blob,
      inputPin: "wrong-pin",
      storedPinHash: "correct-hash",
      userId: "user-1",
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe("BAD_PIN")
    expect(authState.isAuthenticated).toBe(false)
  })

  test("succeeds only when face and PIN are valid", async () => {
    const bcrypt = require("bcryptjs")
    const hash = await bcrypt.hash("1234", 10)

    const result = await loginWithBiometrics({
      inputFace: {} as Blob,
      storedFace: {} as Blob,
      inputPin: "1234",
      storedPinHash: hash,
      userId: "user-1",
    })

    expect(result.ok).toBe(true)
    expect(authState.isAuthenticated).toBe(true)
    expect(authState.userId).toBe("user-1")
  })

  test("logout clears authentication state", () => {
    authState.isAuthenticated = true
    authState.userId = "user-1"

    logout()

    expect(authState.isAuthenticated).toBe(false)
    expect(authState.userId).toBeUndefined()
  })

  test("sensitive action is blocked when logged out", () => {
    logout()
    expect(authState.canPerformSensitiveAction()).toBe(false)
  })

  test("sensitive action is allowed when logged in", () => {
    authState.isAuthenticated = true
    expect(authState.canPerformSensitiveAction()).toBe(true)
  })
})

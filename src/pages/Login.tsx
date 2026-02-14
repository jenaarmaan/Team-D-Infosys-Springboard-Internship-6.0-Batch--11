import { useEffect, useRef, useState } from "react";
import { useGovind } from "@/contexts/GovindContext";
import { Layout } from "@/components/layout/Layout";
import { Mic, CheckCircle2, ShieldCheck, Activity } from "lucide-react";
import { biometricService } from "@/services/biometricService";
import { cn } from "@/lib/utils";

const Login = () => {
  const { authStep, state, setAuthStep } = useGovind();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [livenessStatus, setLivenessStatus] = useState<string>("Ready");
  const [livenessProgress, setLivenessProgress] = useState(0);
  const [faceError, setFaceError] = useState(false);

  // 🎥 CAMERA & BIOMETRIC LIFECYCLE
  useEffect(() => {
    const isBiometricActive = state === "WAITING_FOR_LIVENESS" || authStep === "FACE";

    if (!isBiometricActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }

    const startBiometricFlow = async () => {
      try {
        console.log("[LOGIN] Starting Biometric Hardware...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 }
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Wait for metadata to ensure dimensions are correct
          await new Promise((res) => {
            videoRef.current!.onloadedmetadata = res;
          });
          await videoRef.current.play();
          console.log("[LOGIN] Video stream active.");
        }

        if (state === "WAITING_FOR_LIVENESS") {
          // Give the user a moment to adjust before starting the loop
          setTimeout(() => {
            runLivenessCheck();
          }, 1000);
        }

      } catch (err) {
        console.error("[LOGIN] Biometric Hardware Error:", err);
        setLivenessStatus("Hardware Error");
      }
    };

    startBiometricFlow();

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [state, authStep]);

  const runLivenessCheck = async () => {
    if (!videoRef.current) return;

    setLivenessStatus("Presence Verification...");
    setLivenessProgress(10);

    try {
      // 1. PERFORM ROBUST LIVENESS (3D + EAR)
      const livenessResult = await biometricService.checkLiveness(
        videoRef.current,
        (progress, msg) => {
          setLivenessProgress(progress);
          setLivenessStatus(msg);
        }
      );

      if (livenessResult.success) {
        setLivenessStatus("Presence Verified. Matching Face...");
        setLivenessProgress(85);

        // 👤 Phase 2: Identity Match (Local Only)
        // UID is set in window.govind_uid by Context after Step 1
        const currentUid = (window as any).govind_uid;
        if (!currentUid) {
          setLivenessStatus("Error: Security Descriptor Missing.");
          setFaceError(true);
          return;
        }

        const anchorBase64 = localStorage.getItem(`govind_face_${currentUid}`);
        if (!anchorBase64) {
          setLivenessStatus("Error: Registered face profile missing from local vault.");
          setFaceError(true);
          return;
        }

        const matchResult = await biometricService.verifyIdentityWithAnchor(
          videoRef.current,
          anchorBase64
        );

        if (matchResult.match) {
          setLivenessStatus("Access Granted!");
          setLivenessProgress(100);
          console.log("[LOGIN] Biometric Identity Verified. Proceeding to PIN.");

          setTimeout(() => {
            emitFaceResult("FACE_OK");
            setAuthStep("VOICE_PIN");
          }, 1000);
        } else {
          setLivenessStatus("Identity Mismatch. Please check the lens.");
          setFaceError(true);
        }
      } else {
        setLivenessStatus("Liveness Failed: " + livenessResult.reason);
        setFaceError(true);
      }
    } catch (err) {
      console.error("[LOGIN] Biometric check failed", err);
      setLivenessStatus("Analysis Error");
      setFaceError(true);
    }
  };

  const emitFaceResult = (result: "FACE_OK" | "FACE_FAIL") => {
    console.log("[LOGIN] Emitting result:", result);
    window.dispatchEvent(
      new CustomEvent("govind:face", {
        detail: { result },
      })
    );
  };

  return (
    <Layout>
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
        <div className="text-center space-y-8 w-full max-w-4xl">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">🔐 Secure Authentication</h1>
            <p className="text-muted-foreground">
              Multi-modal verification: <span className="text-primary font-semibold">{state}</span>
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center justify-center">

            {/* LEFT: LIVE BIOMETRIC HUD */}
            <div className="space-y-4">
              <div className="relative group mx-auto w-72 h-72">
                <div className={cn(
                  "absolute -inset-4 rounded-full border-2 border-dashed border-primary/20 animate-[spin_10s_linear_infinite]",
                  state === "WAITING_FOR_LIVENESS" && "border-primary/40"
                )} />

                <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden rounded-3xl">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />

                  {state === "WAITING_FOR_LIVENESS" && (
                    <div className="absolute inset-x-0 h-1 bg-primary/50 shadow-[0_0_15px_rgba(var(--primary),0.5)] animate-[scan_3s_ease-in-out_infinite]" />
                  )}
                </div>

                <div className="relative w-72 h-72 rounded-3xl overflow-hidden bg-black shadow-2xl border-4 border-white/5">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />

                  <div className="absolute bottom-0 inset-x-0 bg-black/60 backdrop-blur-md p-4 text-left border-t border-white/10">
                    <div className="flex items-center gap-3">
                      <Activity className="w-4 h-4 text-primary animate-pulse" />
                      <span className="text-xs font-mono text-white/80 uppercase tracking-widest">
                        {livenessStatus}
                      </span>
                    </div>
                    <div className="mt-2 h-1 w-full bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${livenessProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: INSTRUCTION CARD */}
            <div className="space-y-6 text-left p-8 bg-secondary/30 rounded-3xl border border-white/5 backdrop-blur-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Biometric Security</h2>
                  <p className="text-xs text-muted-foreground uppercase">Identity Assurance Level 3</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold mt-0.5">1</div>
                  <div>
                    <p className="text-sm font-semibold">Passive Depth & Presence</p>
                    <p className="text-xs text-muted-foreground">The AI validates your 3D structure and presence proof (blink/motion).</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold mt-0.5">2</div>
                  <div>
                    <p className="text-sm font-semibold">Encrypted Identity Match</p>
                    <p className="text-xs text-muted-foreground">Your live face is compared against your vault anchor locally.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold mt-0.5">3</div>
                  <div>
                    <p className="text-sm font-semibold">Voice PIN Confirmation</p>
                    <p className="text-xs text-muted-foreground">Final step: Secure four-digit spoken PIN.</p>
                  </div>
                </div>
              </div>

              {faceError && (
                <button
                  className="w-full mt-6 py-3 rounded-2xl bg-destructive/10 text-destructive text-sm font-bold border border-destructive/20 hover:bg-destructive/20 transition-all"
                  onClick={() => {
                    setFaceError(false);
                    runLivenessCheck();
                  }}
                >
                  Retry Verification
                </button>
              )}
            </div>
          </div>

          {/* VOICE PIN STEP */}
          {authStep === "VOICE_PIN" && (
            <div className="pt-8 border-t border-white/5 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                  <Mic className="w-8 h-8 text-primary animate-pulse" />
                </div>
                <div>
                  <p className="text-lg font-bold">Biometrics Verified</p>
                  <p className="text-sm text-muted-foreground">Please say your four digit voice PIN.</p>
                </div>
              </div>
            </div>
          )}

          {/* SUCCESS MESSAGE */}
          {authStep === "COMPLETE" && (
            <div className="pt-8 animate-in zoom-in-95">
              <div className="flex flex-col items-center gap-4">
                <CheckCircle2 className="w-16 h-16 text-green-500" />
                <p className="text-xl font-bold">Security Cleared</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes scan {
          0%, 100% { top: 0%; opacity: 0.1; }
          50% { top: 100%; opacity: 0.8; }
        }
      `}</style>
    </Layout>
  );
};

export default Login;

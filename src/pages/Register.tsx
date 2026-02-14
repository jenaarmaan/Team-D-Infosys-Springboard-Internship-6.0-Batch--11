// src/pages/Register.tsx

import { useEffect, useRef, useState } from "react";
import { useGovind } from "@/contexts/GovindContext";
import { Layout } from "@/components/layout/Layout";
import { CheckCircle2, AlertCircle, ShieldCheck, Activity } from "lucide-react";
import { biometricService } from "@/services/biometricService";
import { cn } from "@/lib/utils";

const Register = () => {
  const { authStep, setRegistrationFaceImage } = useGovind();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [livenessStatus, setLivenessStatus] = useState<string>("Initializing...");
  const [livenessProgress, setLivenessProgress] = useState(0);
  const [livenessError, setLivenessError] = useState<string | null>(null);

  /* ================= CAMERA & BIOMETRIC SETUP ================= */

  useEffect(() => {
    const isFaceActive = authStep === "FACE";

    if (!isFaceActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }

    const startRegistrationBiometrics = async () => {
      try {
        console.log("[REGISTER] Initializing Biometric Hardware...");

        // 1. Initialize AI Models
        await biometricService.init();

        // 2. Request Camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Wait for metadata
          await new Promise((res) => {
            videoRef.current!.onloadedmetadata = res;
          });
          await videoRef.current.play();
          console.log("[REGISTER] Camera Active");
        }

        // 3. Start Liveness Scan after a brief delay
        setTimeout(() => {
          runLivenessAnchor();
        }, 1500);

      } catch (err) {
        console.error("[REGISTER] Initialization Error:", err);
        setLivenessError("Camera access or AI module failed. Please check permissions.");
      }
    };

    startRegistrationBiometrics();

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [authStep]);

  const runLivenessAnchor = async () => {
    if (!videoRef.current) return;

    setLivenessStatus("Presence Verification...");
    setLivenessProgress(10);
    setLivenessError(null);

    try {
      // Perform a full liveness check to ensure the anchor is NOT a spoof
      const result = await biometricService.checkLiveness(
        videoRef.current,
        (progress, msg) => {
          setLivenessProgress(progress);
          setLivenessStatus(msg);
        }
      );

      if (result.success) {
        setLivenessStatus("Presence Verified!");
        setLivenessProgress(100);

        // Capture the "Anchor" frame
        captureAnchorFrame();
      } else {
        setLivenessStatus("Verification Failed");
        setLivenessError(result.reason || "Liveness check failed.");
      }
    } catch (err) {
      console.error("[REGISTER] Biometric Analysis Error:", err);
      setLivenessError("Secure analysis failed. Please ensure good lighting.");
    }
  };

  const captureAnchorFrame = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;

      const file = new File([blob], "face_anchor.jpg", { type: "image/jpeg" });
      setRegistrationFaceImage(file);

      // 🔐 Advance flow
      window.dispatchEvent(new CustomEvent("govind:face", {
        detail: { result: "FACE_OK" }
      }));

      console.log("[REGISTER] Secure face anchor captured");
    }, "image/jpeg", 0.95);
  };

  return (
    <Layout>
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
        <div className="text-center space-y-8 w-full max-w-4xl">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">🎙️ Secure Registration</h1>
            <p className="text-muted-foreground">
              Establishing your <span className="text-primary font-semibold">Liveness-Aware Identity</span>
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center justify-center">

            {/* LEFT: LIVE BIOMETRIC HUD */}
            <div className="space-y-4">
              <div className="relative group mx-auto w-72 h-72">
                <div className="absolute -inset-4 rounded-full border-2 border-dashed border-primary/20 animate-[spin_10s_linear_infinite]" />

                <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden rounded-3xl">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
                  <div className="absolute inset-x-0 h-1 bg-primary/50 shadow-[0_0_15px_rgba(var(--primary),0.5)] animate-[scan_3s_ease-in-out_infinite]" />
                </div>

                <div className="relative w-72 h-72 rounded-3xl overflow-hidden bg-black shadow-2xl border-4 border-white/5">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />

                  {/* Status HUD */}
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

            {/* RIGHT: REGISTRATION STATUS */}
            <div className="space-y-6 text-left p-8 bg-secondary/20 rounded-3xl border border-white/5 backdrop-blur-sm">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Anchor Capture</h2>
                  <p className="text-xs text-muted-foreground uppercase">Step: {authStep}</p>
                </div>
              </div>

              {authStep === "FACE" ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    We are creating a secure biometric anchor for your account. This prevents others from using your voice or photos to log in.
                  </p>

                  {livenessError ? (
                    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl space-y-3">
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="w-4 h-4" />
                        <p className="text-xs font-bold uppercase">Security Warning</p>
                      </div>
                      <p className="text-sm text-destructive/90">{livenessError}</p>
                      <button
                        onClick={runLivenessAnchor}
                        className="w-full py-2 bg-destructive text-white text-xs font-bold rounded-lg hover:opacity-90 transition-opacity"
                      >
                        Try Again
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl">
                      <ul className="text-xs space-y-2 text-muted-foreground">
                        <li className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Look directly into the lens.
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Blink naturally when prompted.
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Move head slightly side-to-side.
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4 py-4">
                  <div className="flex items-center gap-3 text-green-500">
                    <CheckCircle2 className="w-6 h-6" />
                    <p className="font-bold">Identity Verified</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Your biometric anchor has been securely established. Proceeding to finalize your profile.
                  </p>
                </div>
              )}
            </div>
          </div>
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

export default Register;

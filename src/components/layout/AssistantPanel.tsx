import { useEffect, useRef } from "react";
import { useGovind } from "@/contexts/GovindContext";
import { cn } from "@/lib/utils";
import { Mic, X } from "lucide-react";

const GovindOverlay = () => {
  const { enableAssistant } = useGovind();

  return (
    <div
      onClick={enableAssistant}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 text-white cursor-pointer"
    >
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold">Govind is Ready</h1>
        <p className="text-sm opacity-80">
          Click anywhere to start voice assistant
        </p>
      </div>
    </div>
  );
};

export const AssistantPanel = () => {
  const {
    state,
    messages,
    isAssistantOpen,
    setIsAssistantOpen,
    assistantEnabled, // 🔑 IMPORTANT
  } = useGovind();

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  return (
    <>
      {/* 🔑 SHOW OVERLAY ONLY UNTIL ENABLED */}
      {!assistantEnabled && <GovindOverlay />}

      <div
        className={cn(
          "fixed z-50 bg-background border shadow-xl transition-all",
          isAssistantOpen
            ? "top-16 right-0 bottom-0 w-80"
            : "right-4 bottom-4 w-14 h-14 rounded-full"
        )}
      >
        {!isAssistantOpen && (
          <button
            onClick={() => setIsAssistantOpen(true)}
            className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground"
          >
            <Mic />
          </button>
        )}

        {isAssistantOpen && (
          <div className="flex flex-col h-full">
            <div className="p-3 border-b flex justify-between">
              <span className="text-sm font-medium">
                Govind · {state}
              </span>
              <button onClick={() => setIsAssistantOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 p-3 space-y-2 overflow-y-auto"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "px-3 py-2 rounded-lg text-sm max-w-[85%]",
                    m.role === "user" &&
                      "ml-auto bg-primary text-primary-foreground",
                    m.role === "assistant" && "bg-secondary",
                    m.role === "system" && "mx-auto text-xs italic"
                  )}
                >
                  {m.content}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

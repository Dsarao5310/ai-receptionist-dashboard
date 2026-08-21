"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Info, RotateCcw, Send, User } from "lucide-react";
import type { AppConfiguration } from "@/types";
import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { simulateReply, SUGGESTED_PROMPTS } from "@/services/receptionist-simulator";

interface Turn {
  id: number;
  speaker: "customer" | "ai";
  text: string;
  source?: string;
}

/**
 * Lets the owner check their configuration by talking to it. Every reply is
 * produced by the simulator from the current business profile and AI settings,
 * so what appears here is a direct consequence of the surrounding pages — and
 * it is labelled as a simulation throughout, because no AI backend is connected.
 */
export function TestReceptionist({
  config,
  open,
  onOpenChange,
}: {
  config: AppConfiguration;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const openingTurn = (): Turn[] => [{ id: 0, speaker: "ai", text: config.ai.greeting, source: "Greeting" }];

  function greet() {
    setTurns(openingTurn());
  }

  // Start a fresh conversation each time the panel opens. Adjusting state during
  // render rather than in an effect avoids a first paint showing the previous
  // session's messages. Keyed on `open` only — re-greeting whenever the greeting
  // text changes would interrupt a test in progress.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setTurns(open ? openingTurn() : []);
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  function send(text: string) {
    const question = text.trim();
    if (!question) return;
    const reply = simulateReply(config, question);
    setTurns((t) => [
      ...t,
      { id: t.length, speaker: "customer", text: question },
      { id: t.length + 1, speaker: "ai", text: reply.text, source: reply.source },
    ]);
    setInput("");
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-lg">
        <DrawerHeader>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <DrawerTitle>Test your receptionist</DrawerTitle>
              <Badge tone="warning">Simulation</Badge>
            </div>
            <DrawerDescription>Answers come from your current settings — not a live AI.</DrawerDescription>
          </div>
          <DrawerClose />
        </DrawerHeader>

        <DrawerBody ref={scrollRef} className="space-y-4">
          <p className="flex items-start gap-1.5 rounded-lg border border-dashed border-border-strong px-3 py-2.5 text-xs text-text-muted">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            This uses your business hours, services and knowledge to work out replies. Change a setting and ask again to see the difference.
          </p>

          {turns.map((turn) =>
            turn.speaker === "customer" ? (
              <div key={turn.id} className="flex items-start justify-end gap-2.5">
                <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-surface-sunken px-3.5 py-2 text-sm text-text-primary">{turn.text}</p>
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-text-secondary">
                  <User className="h-3.5 w-3.5" />
                </span>
              </div>
            ) : (
              <div key={turn.id} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent-text">
                  <Bot className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 max-w-[85%]">
                  <p className="whitespace-pre-line rounded-2xl rounded-tl-sm bg-accent-subtle/60 px-3.5 py-2 text-sm text-text-primary">
                    {turn.text}
                  </p>
                  {turn.source && <p className="mt-1 pl-1 text-[11px] text-text-muted">From: {turn.source}</p>}
                </div>
              </div>
            )
          )}

          {turns.length <= 1 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Try asking</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => send(prompt)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </DrawerBody>

        <DrawerFooter className="flex-col gap-2 sm:flex-row sm:items-center">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex w-full items-center gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask something a customer might ask..."
              aria-label="Your message"
            />
            <Button type="submit" size="sm" disabled={!input.trim()} aria-label="Send message">
              <Send className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={greet} aria-label="Restart conversation">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </form>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

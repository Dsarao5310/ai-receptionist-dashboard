"use client";

import { Bot, User } from "lucide-react";
import type { AppConfiguration } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { simulateReply } from "@/services/receptionist-simulator";

/**
 * Shows the effect of the current configuration in the customer's words. Every
 * line runs through the same simulator the Test Receptionist uses, so this can
 * never drift from what the test panel would say.
 */
export function ConfigurationPreview({ config, questions }: { config: AppConfiguration; questions: string[] }) {
  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <div className="flex items-center gap-2">
          <CardTitle>Live preview</CardTitle>
          <Badge tone="neutral">Simulated</Badge>
        </div>
        <CardDescription>How your receptionist would answer with the settings above.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {questions.map((question) => {
          const answer = simulateReply(config, question);
          return (
            <div key={question} className="space-y-2">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-text-secondary">
                  <User className="h-3.5 w-3.5" />
                </span>
                <p className="text-sm text-text-secondary">{question}</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent-text">
                  <Bot className="h-3.5 w-3.5" />
                </span>
                <p className="whitespace-pre-line text-sm text-text-primary">{answer.text}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

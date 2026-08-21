"use client";

import { useMemo, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { useConfiguration } from "@/lib/store/configuration";
import { useWorkspaceData } from "@/lib/workspace-data";
import { ReceptionistHeader } from "@/features/ai-receptionist/ReceptionistHeader";
import { GreetingEditor } from "@/features/ai-receptionist/GreetingEditor";
import { PersonalitySettings, VoiceSettingsCard } from "@/features/ai-receptionist/BehaviorSettings";
import { AfterHoursCard, BookingRulesCard, EscalationCard } from "@/features/ai-receptionist/RulesSettings";
import { KnowledgeSummary } from "@/features/ai-receptionist/KnowledgeSummary";
import { TestReceptionist } from "@/features/ai-receptionist/TestReceptionist";
import { ConfigurationPreview } from "@/features/business-profile/ConfigurationPreview";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { getReceptionistActivity, getReceptionistStatus } from "@/services/ai-receptionist";
import { useIntegrations } from "@/lib/store/integrations";
import { getSetupCompleteness } from "@/services/business";

export default function AIReceptionistPage() {
  const config = useConfiguration();
  const { updateAI } = config;
  const { liveDataset, loading } = useWorkspaceData();

  const [testOpen, setTestOpen] = useState(false);

  const now = useMemo(() => (liveDataset ? new Date(liveDataset.generatedAt) : new Date()), [liveDataset]);
  const capabilities = useIntegrations((s) => s.capabilities);
  const status = useMemo(
    () => getReceptionistStatus(config, capabilities),
    [config, capabilities]
  );
  const activity = useMemo(() => getReceptionistActivity(config, liveDataset, now), [config, liveDataset, now]);
  const completeness = useMemo(() => getSetupCompleteness(config), [config]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">AI Receptionist</h2>
          <p className="mt-0.5 text-xs text-text-muted">Control how your receptionist behaves with customers.</p>
        </div>
        <Button size="sm" onClick={() => setTestOpen(true)}>
          <MessageSquareText className="h-3.5 w-3.5" /> Test receptionist
        </Button>
      </div>

      {loading ? (
        <Card className="p-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-3 h-4 w-72" />
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </Card>
      ) : (
        <ReceptionistHeader
          ai={config.ai}
          status={status}
          activity={activity}
          onToggleEnabled={(enabled) => updateAI({ enabled })}
          onToggleChannel={(channel, enabled) => updateAI({ channels: { ...config.ai.channels, [channel]: enabled } })}
        />
      )}

      <GreetingEditor config={config} onSave={(greeting) => updateAI({ greeting })} />

      <div className="grid gap-4 lg:grid-cols-2">
        <PersonalitySettings personality={config.ai.personality} onChange={(personality) => updateAI({ personality })} />
        <VoiceSettingsCard
          voice={config.ai.voice}
          channelEnabled={config.ai.enabled && config.ai.channels.voice}
          onChange={(patch) => updateAI({ voice: { ...config.ai.voice, ...patch } })}
        />
      </div>

      <BookingRulesCard booking={config.ai.booking} onChange={(patch) => updateAI({ booking: { ...config.ai.booking, ...patch } })} />

      <div className="grid gap-4 lg:grid-cols-2">
        <AfterHoursCard value={config.ai.afterHours} onChange={(afterHours) => updateAI({ afterHours })} />
        <EscalationCard
          escalation={config.ai.escalation}
          onChange={(patch) => updateAI({ escalation: { ...config.ai.escalation, ...patch } })}
        />
      </div>

      <KnowledgeSummary completeness={completeness} />

      <ConfigurationPreview config={config} questions={["I'd like to book an appointment", "Can I cancel my appointment?"]} />

      <TestReceptionist config={config} open={testOpen} onOpenChange={setTestOpen} />
    </div>
  );
}

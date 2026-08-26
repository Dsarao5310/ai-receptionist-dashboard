"use client";

import { useCallback, useState } from "react";
import { useConfiguration } from "@/lib/store/configuration";
import { BusinessDetailsForm } from "@/features/business-profile/BusinessDetailsForm";
import { HoursEditor } from "@/features/business-profile/HoursEditor";
import { SpecialHoursEditor } from "@/features/business-profile/SpecialHoursEditor";
import { ServicesManager } from "@/features/business-profile/ServicesManager";
import { KnowledgeManager } from "@/features/business-profile/KnowledgeManager";
import { SetupCompleteness } from "@/features/business-profile/SetupCompleteness";
import { ConfigurationPreview } from "@/features/business-profile/ConfigurationPreview";
import { UnsavedChangesDialog } from "@/components/shared/SaveBar";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { getSetupCompleteness } from "@/services/business";
import type { ProfileTab } from "./tabs";

export default function BusinessProfileView({ initialTab }: { initialTab: ProfileTab }) {
  const config = useConfiguration();
  const {
    updateBusiness,
    updateHours,
    addSpecialHours,
    updateSpecialHours,
    removeSpecialHours,
    addService,
    updateService,
    removeService,
    moveService,
    addKnowledge,
    updateKnowledge,
    removeKnowledge,
  } = config;

  // The AI Receptionist page links straight to a section, e.g. "?tab=knowledge".
  const [tab, setTab] = useState<ProfileTab>(initialTab);

  // Only the two forms that batch edits can hold unsaved work; the list editors
  // save each change immediately, so they never contribute to this.
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [hoursDirty, setHoursDirty] = useState(false);
  const { blocked, confirmLeave, cancelLeave } = useUnsavedChanges(detailsDirty || hoursDirty);

  const completeness = getSetupCompleteness(config);

  const handleDetailsDirty = useCallback((d: boolean) => setDetailsDirty(d), []);
  const handleHoursDirty = useCallback((d: boolean) => setHoursDirty(d), []);

  return (
    <div className="space-y-4">
      <PageHeader description="This is the information your AI receptionist uses when helping customers." />

      <SetupCompleteness completeness={completeness} onJump={setTab} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as ProfileTab)}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="hours">Hours</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <div className="space-y-4">
            <BusinessDetailsForm value={config.business} onSave={updateBusiness} onDirtyChange={handleDetailsDirty} />
            <ConfigurationPreview config={config} questions={["Where are you located?", "What's your phone number?"]} />
          </div>
        </TabsContent>

        <TabsContent value="hours">
          <div className="space-y-4">
            <HoursEditor value={config.hours} onSave={updateHours} onDirtyChange={handleHoursDirty} />
            <SpecialHoursEditor
              entries={config.specialHours}
              onAdd={addSpecialHours}
              onUpdate={updateSpecialHours}
              onRemove={removeSpecialHours}
            />
            <ConfigurationPreview config={config} questions={["What time do you close on Wednesday?", "Are you open today?"]} />
          </div>
        </TabsContent>

        <TabsContent value="services">
          <div className="space-y-4">
            <ServicesManager
              services={config.services}
              onAdd={addService}
              onUpdate={updateService}
              onRemove={removeService}
              onMove={moveService}
            />
            <ConfigurationPreview config={config} questions={["What services do you offer?", "How much is a haircut?"]} />
          </div>
        </TabsContent>

        <TabsContent value="knowledge">
          <div className="space-y-4">
            <KnowledgeManager entries={config.knowledge} onAdd={addKnowledge} onUpdate={updateKnowledge} onRemove={removeKnowledge} />
            <ConfigurationPreview config={config} questions={["Do you accept walk-ins?", "What payment methods do you take?"]} />
          </div>
        </TabsContent>
      </Tabs>

      <UnsavedChangesDialog open={blocked} onConfirm={confirmLeave} onCancel={cancelLeave} />
    </div>
  );
}

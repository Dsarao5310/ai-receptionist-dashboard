"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import type { BusinessService, PriceModel } from "@/types";
import { PRICE_MODEL_LABELS } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { toast } from "@/lib/store/toast";
import { formatServiceDuration, formatServicePrice } from "@/services/business";
import { cn } from "@/lib/utils";

const PRICE_MODELS: PriceModel[] = ["fixed", "from", "free", "contact", "hidden"];

interface Draft {
  name: string;
  description: string;
  priceModel: PriceModel;
  price: string;
  durationMin: string;
  active: boolean;
}

const EMPTY_DRAFT: Draft = { name: "", description: "", priceModel: "fixed", price: "", durationMin: "30", active: true };

function toDraft(service: BusinessService): Draft {
  return {
    name: service.name,
    description: service.description,
    priceModel: service.priceModel,
    price: String(service.price),
    durationMin: String(service.durationMin),
    active: service.active,
  };
}

function validate(draft: Draft): string | null {
  if (!draft.name.trim()) return "Give the service a name.";
  const duration = Number(draft.durationMin);
  if (!Number.isFinite(duration) || duration < 5 || duration > 480) return "Duration must be between 5 and 480 minutes.";
  if (draft.priceModel === "fixed" || draft.priceModel === "from") {
    const price = Number(draft.price);
    if (!Number.isFinite(price) || price < 0 || price > 100000) return "Enter a valid price.";
  }
  return null;
}

export function ServicesManager({
  services,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
}: {
  services: BusinessService[];
  onAdd: (service: Omit<BusinessService, "id">) => Promise<boolean>;
  onUpdate: (id: string, patch: Partial<Omit<BusinessService, "id">>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onMove: (id: string, direction: -1 | 1) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<BusinessService | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BusinessService | null>(null);

  const dialogOpen = addOpen || !!editing;

  function openAdd() {
    setDraft(EMPTY_DRAFT);
    setError(null);
    setEditing(null);
    setAddOpen(true);
  }

  function openEdit(service: BusinessService) {
    setDraft(toDraft(service));
    setError(null);
    setAddOpen(false);
    setEditing(service);
  }

  function closeDialog() {
    setAddOpen(false);
    setEditing(null);
    setError(null);
  }

  async function submit() {
    const message = validate(draft);
    if (message) return setError(message);

    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      priceModel: draft.priceModel,
      price: draft.priceModel === "fixed" || draft.priceModel === "from" ? Number(draft.price) : 0,
      durationMin: Number(draft.durationMin),
      active: draft.active,
    };

    const ok = editing ? await onUpdate(editing.id, payload) : await onAdd(payload);
    if (!ok) return;
    toast.success(`${payload.name} ${editing ? "updated" : "added"}`);
    closeDialog();
  }

  const needsPrice = draft.priceModel === "fixed" || draft.priceModel === "from";

  return (
    <>
      <Card>
        <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div>
            <CardTitle>Services</CardTitle>
            <CardDescription>What your receptionist can describe, quote and book for customers.</CardDescription>
          </div>
          <Button size="sm" className="sm:ml-auto" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" /> Add service
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {services.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="No services yet"
              description="Add the services your AI receptionist should know about."
              action={
                <Button size="sm" onClick={openAdd}>
                  <Plus className="h-3.5 w-3.5" /> Add service
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {services.map((service, index) => (
                <li key={service.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-0.5 pt-0.5">
                    <button
                      onClick={() => onMove(service.id, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${service.name} up`}
                      className="rounded p-0.5 text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onMove(service.id, 1)}
                      disabled={index === services.length - 1}
                      aria-label={`Move ${service.name} down`}
                      className="rounded p-0.5 text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-sm font-medium", service.active ? "text-text-primary" : "text-text-muted line-through")}>
                        {service.name}
                      </span>
                      {!service.active && <Badge tone="neutral">Inactive</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-text-secondary tabular-nums">
                      {formatServicePrice(service)} · {formatServiceDuration(service)}
                    </p>
                    {service.description && <p className="mt-1 text-xs text-text-secondary line-clamp-2">{service.description}</p>}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      checked={service.active}
                      onCheckedChange={async (checked) => {
                        if (await onUpdate(service.id, { active: checked })) {
                          toast.success(`${service.name} ${checked ? "activated" : "deactivated"}`);
                        }
                      }}
                      aria-label={`${service.name} active`}
                    />
                    <button
                      onClick={() => openEdit(service)}
                      className="rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
                      aria-label={`Edit ${service.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setPendingDelete(service)}
                      className="rounded-md p-1.5 text-text-muted hover:bg-danger-bg hover:text-danger transition-colors"
                      aria-label={`Delete ${service.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit service" : "Add service"}</DialogTitle>
            <DialogDescription>Your receptionist quotes these details to customers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5 max-h-[60vh] overflow-y-auto">
            <div>
              <Label htmlFor="svc-name">Name</Label>
              <Input id="svc-name" value={draft.name} placeholder="e.g. Men's Haircut" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="svc-desc">Description</Label>
              <Textarea id="svc-desc" rows={2} value={draft.description} placeholder="A short description customers would understand." onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="svc-pricing">Pricing</Label>
                <Select value={draft.priceModel} onValueChange={(v) => setDraft((d) => ({ ...d, priceModel: v as PriceModel }))}>
                  <SelectTrigger id="svc-pricing" aria-label="Pricing model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICE_MODELS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PRICE_MODEL_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {needsPrice && (
                <div>
                  <Label htmlFor="svc-price">Price</Label>
                  <Input id="svc-price" type="number" min={0} value={draft.price} placeholder="0" onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))} />
                </div>
              )}
              <div className={needsPrice ? "col-span-2" : undefined}>
                <Label htmlFor="svc-duration">Duration (minutes)</Label>
                <Input id="svc-duration" type="number" min={5} max={480} step={5} value={draft.durationMin} onChange={(e) => setDraft((d) => ({ ...d, durationMin: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Switch id="svc-active" checked={draft.active} onCheckedChange={(c) => setDraft((d) => ({ ...d, active: c }))} />
              <label htmlFor="svc-active" className="text-sm text-text-primary cursor-pointer">
                Active — offered to customers
              </label>
            </div>
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={closeDialog}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit}>
              {editing ? "Save service" : "Add service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this service?</DialogTitle>
            <DialogDescription>
              {pendingDelete?.name} will be removed and your receptionist will stop offering it. If you only want to pause it, switch it to
              inactive instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPendingDelete(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                const service = pendingDelete;
                if (!service) return;
                setPendingDelete(null);
                if (await onRemove(service.id)) toast(`${service.name} deleted`);
              }}
            >
              Delete service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

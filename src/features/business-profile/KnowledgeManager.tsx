"use client";

import { useMemo, useState } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import type { KnowledgeCategory, KnowledgeEntry } from "@/types";
import { KNOWLEDGE_CATEGORY_LABELS } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { toast } from "@/lib/store/toast";
import { cn } from "@/lib/utils";

const CATEGORIES = Object.keys(KNOWLEDGE_CATEGORY_LABELS) as KnowledgeCategory[];

interface Draft {
  category: KnowledgeCategory;
  title: string;
  content: string;
  active: boolean;
}

const EMPTY_DRAFT: Draft = { category: "faq", title: "", content: "", active: true };

/**
 * Everything the receptionist knows beyond hours and services. Presented as
 * plain "business knowledge" — a business owner shouldn't have to think about
 * how it's indexed or retrieved to write a good answer.
 */
export function KnowledgeManager({
  entries,
  onAdd,
  onUpdate,
  onRemove,
}: {
  entries: KnowledgeEntry[];
  onAdd: (entry: Omit<KnowledgeEntry, "id">) => void;
  onUpdate: (id: string, patch: Partial<Omit<KnowledgeEntry, "id">>) => void;
  onRemove: (id: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeEntry | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<KnowledgeEntry | null>(null);
  const [filter, setFilter] = useState<KnowledgeCategory | "all">("all");

  const visible = useMemo(() => (filter === "all" ? entries : entries.filter((e) => e.category === filter)), [entries, filter]);
  const dialogOpen = addOpen || !!editing;

  function openAdd() {
    setDraft(EMPTY_DRAFT);
    setError(null);
    setEditing(null);
    setAddOpen(true);
  }

  function openEdit(entry: KnowledgeEntry) {
    setDraft({ category: entry.category, title: entry.title, content: entry.content, active: entry.active });
    setError(null);
    setAddOpen(false);
    setEditing(entry);
  }

  function closeDialog() {
    setAddOpen(false);
    setEditing(null);
    setError(null);
  }

  function submit() {
    if (!draft.title.trim()) return setError("Add a title or question.");
    if (!draft.content.trim()) return setError("Add the answer your receptionist should give.");

    const payload = { category: draft.category, title: draft.title.trim(), content: draft.content.trim(), active: draft.active };
    if (editing) {
      onUpdate(editing.id, payload);
      toast.success("Knowledge updated");
    } else {
      onAdd(payload);
      toast.success("Knowledge added");
    }
    closeDialog();
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div>
            <CardTitle>Business knowledge</CardTitle>
            <CardDescription>Questions and policies your receptionist can answer from.</CardDescription>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <Select value={filter} onValueChange={(v) => setFilter(v as KnowledgeCategory | "all")}>
              <SelectTrigger className="w-[190px]" aria-label="Filter by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {KNOWLEDGE_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {entries.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No business knowledge yet"
              description="Add FAQs and policies so your receptionist can answer more customer questions."
              action={
                <Button size="sm" onClick={openAdd}>
                  <Plus className="h-3.5 w-3.5" /> Add knowledge
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState title="Nothing in this category yet" description="Add an entry, or choose a different category." className="py-10" />
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-sm font-medium", entry.active ? "text-text-primary" : "text-text-muted")}>{entry.title}</span>
                      <Badge tone={entry.active ? "accent" : "neutral"}>{KNOWLEDGE_CATEGORY_LABELS[entry.category]}</Badge>
                      {!entry.active && <Badge tone="neutral">Off</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-text-secondary line-clamp-2">{entry.content}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      checked={entry.active}
                      onCheckedChange={(checked) => onUpdate(entry.id, { active: checked })}
                      aria-label={`${entry.title} active`}
                    />
                    <button
                      onClick={() => openEdit(entry)}
                      className="rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
                      aria-label={`Edit ${entry.title}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setPendingDelete(entry)}
                      className="rounded-md p-1.5 text-text-muted hover:bg-danger-bg hover:text-danger transition-colors"
                      aria-label={`Delete ${entry.title}`}
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
            <DialogTitle>{editing ? "Edit knowledge" : "Add knowledge"}</DialogTitle>
            <DialogDescription>Write the answer the way you&apos;d want a customer to hear it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5 max-h-[60vh] overflow-y-auto">
            <div>
              <Label htmlFor="kn-category">Category</Label>
              <Select value={draft.category} onValueChange={(v) => setDraft((d) => ({ ...d, category: v as KnowledgeCategory }))}>
                <SelectTrigger id="kn-category" aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {KNOWLEDGE_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="kn-title">{draft.category === "faq" ? "Question" : "Title"}</Label>
              <Input
                id="kn-title"
                value={draft.title}
                placeholder={draft.category === "faq" ? "Do you accept walk-ins?" : "e.g. Parking"}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="kn-content">{draft.category === "faq" ? "Answer" : "Details"}</Label>
              <Textarea
                id="kn-content"
                rows={4}
                value={draft.content}
                placeholder="What should the receptionist tell customers?"
                onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2.5">
              <Switch id="kn-active" checked={draft.active} onCheckedChange={(c) => setDraft((d) => ({ ...d, active: c }))} />
              <label htmlFor="kn-active" className="text-sm text-text-primary cursor-pointer">
                Active — the receptionist can use this
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
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this entry?</DialogTitle>
            <DialogDescription>
              &ldquo;{pendingDelete?.title}&rdquo; will be removed and your receptionist will no longer use it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPendingDelete(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (pendingDelete) onRemove(pendingDelete.id);
                setPendingDelete(null);
                toast("Knowledge deleted");
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

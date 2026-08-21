"use client";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";

/**
 * Appears only when there is something to save, so a clean form stays calm and
 * the bar's presence is itself the dirty-state signal.
 */
export function SaveBar({
  dirty,
  onSave,
  onCancel,
  saveLabel = "Save changes",
  disabled,
  className,
}: {
  dirty: boolean;
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  if (!dirty) return null;

  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 -mx-4 mt-4 flex items-center gap-3 border-t border-border bg-surface-raised/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6",
        "animate-[slide-in-bottom_180ms_ease-out]",
        className
      )}
      role="region"
      aria-label="Unsaved changes"
    >
      <span className="text-sm text-text-secondary">You have unsaved changes</span>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Discard
        </Button>
        <Button size="sm" onClick={onSave} disabled={disabled}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

export function UnsavedChangesDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard unsaved changes?</DialogTitle>
          <DialogDescription>
            You&apos;ve made changes that haven&apos;t been saved yet. Leaving this page will discard them.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Keep editing
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            Discard changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

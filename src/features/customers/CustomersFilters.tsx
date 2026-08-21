"use client";

import { Search } from "lucide-react";
import type { Channel } from "@/types";
import { Input } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { CHANNEL_LABELS } from "@/data/constants";
import type { CustomerStatus } from "@/services/customers";
import { STATUS_LABEL } from "./shared";

const STATUS_OPTIONS: (CustomerStatus | "all")[] = ["all", "new", "active", "inactive"];
const CHANNEL_OPTIONS: (Channel | "all")[] = ["all", "voice", "sms", "email"];

export function CustomersFilters({
  search,
  onSearch,
  status,
  onStatus,
  channel,
  onChannel,
}: {
  search: string;
  onSearch: (v: string) => void;
  status: CustomerStatus | "all";
  onStatus: (v: CustomerStatus | "all") => void;
  channel: Channel | "all";
  onChannel: (v: Channel | "all") => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input
          placeholder="Search name, phone, or email..."
          className="pl-9"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Search customers"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={status} onValueChange={(v) => onStatus(v as CustomerStatus | "all")}>
          <SelectTrigger className="w-[140px]" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((v) => (
              <SelectItem key={v} value={v}>
                {v === "all" ? "All statuses" : STATUS_LABEL[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={channel} onValueChange={(v) => onChannel(v as Channel | "all")}>
          <SelectTrigger className="w-[150px]" aria-label="Filter by last channel">
            <SelectValue placeholder="Last channel" />
          </SelectTrigger>
          <SelectContent>
            {CHANNEL_OPTIONS.map((v) => (
              <SelectItem key={v} value={v}>
                {v === "all" ? "All channels" : CHANNEL_LABELS[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

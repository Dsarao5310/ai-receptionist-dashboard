"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";

/** A customer name that cross-links to their Customers detail drawer without duplicating detail UI on the current page. */
export function CustomerLink({ customerId, name }: { customerId: string; name: string }) {
  return (
    <Link
      href={`/customers?open=${customerId}`}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-2.5 min-w-0 hover:underline underline-offset-2"
      aria-label={`View ${name} in Customers`}
    >
      <Avatar name={name} size="sm" />
      <span className="font-medium truncate">{name}</span>
    </Link>
  );
}

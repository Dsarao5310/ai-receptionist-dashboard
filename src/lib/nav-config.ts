import {
  LayoutDashboard,
  MessagesSquare,
  Phone,
  CalendarDays,
  Users,
  BarChart3,
  Bot,
  Building2,
  Plug,
  Radio,
  Settings,
  ShieldCheck,
  Workflow,
  CalendarCog,
  type LucideIcon,
} from "lucide-react";
import { resolvePermissions, type Permission, type PermissionContext } from "./permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** The item renders only for a session holding this permission. */
  permission?: Permission;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Navigation, split the way the product is.
 *
 * "Workspace" and "Configure" are the business-facing product. "Administration"
 * is platform territory — provider names, workflow mappings, usage — and its
 * permissions are platform-only, so no business role can reveal it however
 * senior they are within their own business.
 *
 * The filter runs against the *verified* session's permissions, not an editable
 * client value. It is still only presentation: the routes exist, and what
 * actually protects them is that every read and write behind them goes through
 * `server/auth/guards.ts`.
 */
const ALL_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", href: "/", icon: LayoutDashboard, permission: "overview.view" },
      { label: "Conversations", href: "/conversations", icon: MessagesSquare, permission: "conversations.view" },
      { label: "Calls", href: "/calls", icon: Phone, permission: "calls.view" },
      { label: "Appointments", href: "/appointments", icon: CalendarDays, permission: "appointments.view" },
      { label: "Customers", href: "/customers", icon: Users, permission: "customers.view" },
      { label: "Analytics", href: "/analytics", icon: BarChart3, permission: "analytics.view" },
    ],
  },
  {
    label: "Configure",
    items: [
      { label: "AI Receptionist", href: "/ai-receptionist", icon: Bot, permission: "ai.configure" },
      { label: "Business Profile", href: "/business-profile", icon: Building2, permission: "business.edit" },
      { label: "Connections", href: "/connections", icon: Radio, permission: "connections.view" },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Integrations", href: "/admin/integrations", icon: Plug, permission: "integrations.view" },
      { label: "Workflows", href: "/admin/workflows", icon: Workflow, permission: "workflows.view" },
      { label: "Calendar", href: "/admin/calendar", icon: CalendarCog, permission: "integrations.manage" },
      { label: "Workspace admin", href: "/admin/settings", icon: ShieldCheck, permission: "settings.admin" },
    ],
  },
];

export function getNavGroups(context: PermissionContext): NavGroup[] {
  const granted = resolvePermissions(context);
  return ALL_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || granted.has(item.permission)),
  })).filter((group) => group.items.length > 0);
}

/** Every item, for page-title lookup. Not used for anything access-related. */
export const ALL_NAV_ITEMS: NavItem[] = ALL_GROUPS.flatMap((g) => g.items);

const MOBILE_HREFS = ["/", "/conversations", "/appointments", "/customers"];

/** The mobile bar, filtered the same way so a staff user never sees a dead tab. */
export function getMobileNavItems(context: PermissionContext): NavItem[] {
  const granted = resolvePermissions(context);
  return ALL_GROUPS.flatMap((g) => g.items)
    .filter((i) => MOBILE_HREFS.includes(i.href))
    .filter((i) => !i.permission || granted.has(i.permission));
}

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
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", href: "/", icon: LayoutDashboard },
      { label: "Conversations", href: "/conversations", icon: MessagesSquare },
      { label: "Calls", href: "/calls", icon: Phone },
      { label: "Appointments", href: "/appointments", icon: CalendarDays },
      { label: "Customers", href: "/customers", icon: Users },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Configure",
    items: [
      { label: "AI Receptionist", href: "/ai-receptionist", icon: Bot },
      { label: "Business Profile", href: "/business-profile", icon: Building2 },
      { label: "Integrations", href: "/integrations", icon: Plug },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export const MOBILE_NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Conversations", href: "/conversations", icon: MessagesSquare },
  { label: "Appointments", href: "/appointments", icon: CalendarDays },
  { label: "Customers", href: "/customers", icon: Users },
];

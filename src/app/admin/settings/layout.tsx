import { PermissionBoundary } from "@/components/shell/PermissionBoundary";

export default function AdminSettingsLayout({ children }: LayoutProps<"/admin/settings">) {
  return <PermissionBoundary permission="settings.admin">{children}</PermissionBoundary>;
}

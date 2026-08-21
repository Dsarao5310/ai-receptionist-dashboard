import { PermissionBoundary } from "@/components/shell/PermissionBoundary";

export default function AdminIntegrationsLayout({ children }: LayoutProps<"/admin/integrations">) {
  return <PermissionBoundary permission="integrations.view">{children}</PermissionBoundary>;
}

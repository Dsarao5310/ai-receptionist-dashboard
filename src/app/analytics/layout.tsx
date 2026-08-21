import { PermissionBoundary } from "@/components/shell/PermissionBoundary";

export default function AnalyticsLayout({ children }: LayoutProps<"/analytics">) {
  return <PermissionBoundary permission="analytics.view">{children}</PermissionBoundary>;
}

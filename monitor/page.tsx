import type { Metadata } from "next"
import { MonitorDashboard } from "@/components/dashboard/monitor-dashboard"

export const metadata: Metadata = {
  title: "Project health",
}

export default function MonitorPage() {
  return <MonitorDashboard />
}

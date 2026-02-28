"use client";

import { useState } from "react";
import { useActiveSession } from "@/lib/hooks/use-active-session";
import { useHistory } from "@/lib/hooks/use-history";
import { useSerialDevices } from "@/lib/hooks/use-serial-devices";
import { useSerialStatus } from "@/lib/hooks/use-serial-status";
import { useMySqlStatus } from "@/lib/hooks/use-mysql-status";
import { ActiveSessionCard } from "@/components/dashboard/active-session-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { SerialDevicesModal } from "@/components/dashboard/serial-devices-modal";
import { RecentActivityCard } from "@/components/dashboard/recent-activity-card";
import { StatusCards } from "@/components/dashboard/status-cards";

export default function DashboardPage() {
  const session = useActiveSession();
  const history = useHistory();
  const devices = useSerialDevices();
  const serialStatus = useSerialStatus();
  const mysqlStatus = useMySqlStatus();
  const [devicesOpen, setDevicesOpen] = useState(false);

  return (
    <section className="space-y-6">
      <DashboardHeader />
      <StatusCards
        serialConnected={serialStatus?.connected}
        mysqlConnected={mysqlStatus?.connected}
        deviceCount={devices.filter((d) => d.online).length}
        onOpenDevices={() => setDevicesOpen(true)}
      />
      <SerialDevicesModal
        open={devicesOpen}
        devices={devices}
        onClose={() => setDevicesOpen(false)}
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <ActiveSessionCard session={session} />
        <RecentActivityCard rows={history} />
      </div>
    </section>
  );
}

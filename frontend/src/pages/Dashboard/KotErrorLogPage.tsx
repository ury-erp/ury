import React, { useEffect, useState } from "react";
import { Card, Spinner, Select, DataTable, EmptyState, type DataTableColumn } from "@ury/ui";
import { AlertTriangle } from "lucide-react";
import { call } from "@ury/core";
import { useBranchContext } from "../../context/BranchContext";
import { kotErrorLogService, KotErrorLogRow } from "../../services/kotErrorLog";

interface PosProfileOption {
  name: string;
}

type LoadState = "loading" | "empty" | "populated" | "error" | "select-profile";

const columns: DataTableColumn<KotErrorLogRow>[] = [
  { key: "kot", header: "KOT", render: (row) => <span className="font-mono text-xs">{row.kot}</span> },
  { key: "invoice", header: "Invoice" },
  {
    key: "invoice_creation_time",
    header: "Date/Time",
    render: (row) => <span className="text-xs">{row.invoice_creation_time || "—"}</span>,
  },
  { key: "production", header: "Department" },
];

export const KotErrorLogPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [profiles, setProfiles] = useState<PosProfileOption[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>("");
  const [logs, setLogs] = useState<KotErrorLogRow[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const loadProfiles = async () => {
      if (activeBranchId === "all") {
        setState("select-profile");
        setProfiles([]);
        return;
      }
      try {
        const list = await call<any>("frappe.client.get_list", {
          doctype: "POS Profile",
          filters: [["branch", "=", activeBranchId]],
          fields: ["name"],
          limit: 500,
        });
        const records: PosProfileOption[] = list.message || list || [];
        setProfiles(records);
        if (records.length === 0) {
          setState("empty");
        } else if (records.length === 1) {
          setSelectedProfile(records[0].name);
        } else {
          setSelectedProfile("");
          setState("select-profile");
        }
      } catch (err: any) {
        setErrorMessage(err?.message || "Failed to load POS Profiles");
        setState("error");
      }
    };
    loadProfiles();
  }, [activeBranchId]);

  useEffect(() => {
    if (!selectedProfile) return;
    const loadLogs = async () => {
      setState("loading");
      setErrorMessage("");
      try {
        const result = await kotErrorLogService.getKotErrors(selectedProfile);
        setLogs(result || []);
        setState(result && result.length > 0 ? "populated" : "empty");
      } catch (err: any) {
        setErrorMessage(err?.message || "Failed to load KOT error logs");
        setState("error");
      }
    };
    loadLogs();
  }, [selectedProfile]);

  if (activeBranchId === "all") {
    return (
      <Card className="p-6">
        <EmptyState
          icon={AlertTriangle}
          title="Select a branch"
          description="Please select a specific branch to view KOT error logs."
        />
      </Card>
    );
  }

  if (state === "loading" && profiles.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner />
      </div>
    );
  }

  if (state === "empty" && profiles.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={AlertTriangle}
          title="No POS Profiles found"
          description="This branch has no POS Profile configured yet. Set one up to start tracking KOT errors."
        />
      </Card>
    );
  }

  if (state === "error") {
    return (
      <Card className="p-4">
        <p className="text-sm text-destructive">{errorMessage}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {profiles.length > 1 && (
        <Card className="p-4">
          <label className="text-xs text-muted-foreground block mb-2">POS Profile</label>
          <Select
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value)}
            placeholder="Select a POS Profile"
          >
            {profiles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </Select>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4">KOT Error Logs</h3>
        {state === "loading" ? (
          <div className="flex items-center justify-center p-8">
            <Spinner />
          </div>
        ) : logs.length > 0 ? (
          <DataTable columns={columns} rows={logs} />
        ) : (
          <EmptyState
            icon={AlertTriangle}
            title="No KOT errors"
            description="No duplicate or failed Kitchen Order Ticket events have been recorded for this POS Profile yet."
          />
        )}
      </Card>
    </div>
  );
};

export default KotErrorLogPage;

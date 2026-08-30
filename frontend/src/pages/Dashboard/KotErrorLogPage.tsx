import React, { useEffect, useState } from "react";
import { Card, Spinner, Select } from "@ury/ui";
import { call } from "@ury/core";
import { useBranchContext } from "../../context/BranchContext";
import { kotErrorLogService, KotErrorLogRow } from "../../services/kotErrorLog";

interface PosProfileOption {
  name: string;
}

type LoadState = "loading" | "empty" | "populated" | "error" | "select-profile";

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
          setState("loading");
        } else {
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

  if (state === "loading") {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner />
      </div>
    );
  }

  if (activeBranchId === "all") {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Please select a specific branch to view KOT error logs.
        </p>
      </Card>
    );
  }

  if (state === "empty" && profiles.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          No POS Profiles found for this branch.
        </p>
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
      <Card className="p-4">
        <label className="text-xs text-muted-foreground block mb-2">POS Profile</label>
        <Select
          value={selectedProfile}
          onChange={(e) => setSelectedProfile(e.target.value)}
          options={profiles.map((p) => ({ label: p.name, value: p.name }))}
          placeholder="Select a POS Profile"
        />
      </Card>
      {state === "populated" && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-4">KOT Error Logs</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="p-3">KOT</th>
                  <th className="p-3">Invoice</th>
                  <th className="p-3">DateTime</th>
                  <th className="p-3">Production</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => (
                  <tr key={`${log.kot}-${idx}`} className="border-b hover:bg-muted/50">
                    <td className="p-3 font-mono text-xs">{log.kot}</td>
                    <td className="p-3">{log.invoice}</td>
                    <td className="p-3 text-xs">{log.invoice_creation_time || "—"}</td>
                    <td className="p-3">{log.production}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default KotErrorLogPage;

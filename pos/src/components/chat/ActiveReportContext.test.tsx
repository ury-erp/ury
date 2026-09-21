import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactNode } from "react";
import {
  ActiveReportProvider,
  useActiveReportContext,
  type ActiveReportContextValue,
} from "./ActiveReportContext";

describe("ActiveReportContext", () => {
  it("provides context to children", () => {
    const TestComponent = () => {
      const { activeReport } = useActiveReportContext();
      return <div>{activeReport ? "Has report" : "No report"}</div>;
    };

    render(
      <ActiveReportProvider>
        <TestComponent />
      </ActiveReportProvider>
    );

    expect(screen.getByText("No report")).toBeInTheDocument();
  });

  it("throws error when useActiveReportContext is used without provider", () => {
    // Suppress console.error for this test
    const consoleError = console.error;
    console.error = () => {};

    try {
      const TestComponent = () => {
        useActiveReportContext();
        return <div>Should not render</div>;
      };

      expect(() => render(<TestComponent />)).toThrow(
        "useActiveReportContext must be used within an ActiveReportProvider"
      );
    } finally {
      console.error = consoleError;
    }
  });

  it("allows setting active report", async () => {
    const user = userEvent.setup();
    const TestComponent = () => {
      const { activeReport, setActiveReport } = useActiveReportContext();

      const handleSetReport = () => {
        const report: ActiveReportContextValue = {
          reportSlug: "daily-sales",
          label: "Daily Sales Report",
          filters: { branch: "Kozhikode" },
        };
        setActiveReport(report);
      };

      return (
        <div>
          <button onClick={handleSetReport}>Set Report</button>
          <div>
            {activeReport
              ? `Report: ${activeReport.label}`
              : "No report"}
          </div>
        </div>
      );
    };

    render(
      <ActiveReportProvider>
        <TestComponent />
      </ActiveReportProvider>
    );

    expect(screen.getByText("No report")).toBeInTheDocument();

    const button = screen.getByText("Set Report");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Report: Daily Sales Report")).toBeInTheDocument();
    });
  });

  it("allows clearing active report", async () => {
    const user = userEvent.setup();
    const TestComponent = () => {
      const { activeReport, setActiveReport } = useActiveReportContext();

      const handleSetReport = () => {
        const report: ActiveReportContextValue = {
          reportSlug: "test-report",
          label: "Test Report",
        };
        setActiveReport(report);
      };

      const handleClearReport = () => {
        setActiveReport(null);
      };

      return (
        <div>
          <button onClick={handleSetReport}>Set Report</button>
          <button onClick={handleClearReport}>Clear Report</button>
          <div>
            {activeReport ? `Report: ${activeReport.label}` : "No report"}
          </div>
        </div>
      );
    };

    render(
      <ActiveReportProvider>
        <TestComponent />
      </ActiveReportProvider>
    );

    const setButton = screen.getByText("Set Report");
    await user.click(setButton);
    
    await waitFor(() => {
      expect(screen.getByText("Report: Test Report")).toBeInTheDocument();
    });

    const clearButton = screen.getByText("Clear Report");
    await user.click(clearButton);
    
    await waitFor(() => {
      expect(screen.getByText("No report")).toBeInTheDocument();
    });
  });

  it("persists report data across re-renders", () => {
    let renderCount = 0;

    const TestComponent = () => {
      const { activeReport, setActiveReport } = useActiveReportContext();

      if (renderCount === 0) {
        renderCount++;
        const report: ActiveReportContextValue = {
          reportSlug: "test",
          label: "Test",
          filters: { key: "value" },
        };
        setActiveReport(report);
      }

      return (
        <div>
          {activeReport
            ? `${activeReport.label} - ${JSON.stringify(activeReport.filters)}`
            : "No report"}
        </div>
      );
    };

    render(
      <ActiveReportProvider>
        <TestComponent />
      </ActiveReportProvider>
    );

    expect(
      screen.getByText(/Test - {"key":"value"}/)
    ).toBeInTheDocument();
  });

  it("initializes with null active report", () => {
    const TestComponent = () => {
      const { activeReport } = useActiveReportContext();
      return (
        <div>
          {activeReport === null ? "Null report" : "Non-null report"}
        </div>
      );
    };

    render(
      <ActiveReportProvider>
        <TestComponent />
      </ActiveReportProvider>
    );

    expect(screen.getByText("Null report")).toBeInTheDocument();
  });
});

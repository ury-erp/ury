import { Link } from "react-router-dom";
import { reportsRegistry, groupReports } from "./reportsRegistry";

interface CategoryMeta {
  title: string;
  description: string;
}

const categoryMeta: Record<string, CategoryMeta> = {
  Sales: {
    title: "Sales",
    description: "How much did we sell and when?",
  },
  "Menu & Purchasing": {
    title: "Menu & Purchasing",
    description: "What is selling, and what are we buying to make it?",
  },
  Customers: {
    title: "Customers",
    description: "Who is buying from us, and are they coming back?",
  },
  "Team & Operations": {
    title: "Team & Operations",
    description: "How is the team performing and what is in the kitchen pipeline?",
  },
  Exceptions: {
    title: "Exceptions",
    description: "What went wrong or needs a second look?",
  },
  Finance: {
    title: "Finance",
    description: "Are we actually making money?",
  },
};

const categoryOrder = ["Sales", "Menu & Purchasing", "Customers", "Team & Operations", "Exceptions", "Finance"];

export function ReportsHome() {
  const grouped = groupReports(reportsRegistry);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">What do you want to understand?</h1>
      <p className="text-muted-foreground mb-8">
        Pick a category below and find the report that answers your question.
      </p>

      <div className="space-y-8">
        {categoryOrder
          .filter((group) => grouped[group]?.length)
          .map((group) => {
            const meta = categoryMeta[group];
            const reports = grouped[group];
            return (
              <section key={group}>
                <h2 className="text-lg font-semibold">{meta?.title ?? group}</h2>
                {meta?.description && (
                  <p className="text-muted-foreground text-sm mb-3">{meta.description}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {reports.map((report) => {
                    const Icon = report.icon;
                    return (
                      <Link
                        key={report.id}
                        to={report.path}
                        className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-medium">{report.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </div>
    </div>
  );
}

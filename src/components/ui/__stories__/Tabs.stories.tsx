import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const meta: Meta<typeof Tabs> = {
  title: "UI/Tabs",
  component: Tabs,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Tab navigation component used throughout the URY Dashboard for switching between Overview, Tables, Kitchen, Menu, and other dashboard sections.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Tabs>;

// ── Default Tabs ─────────────────────────────────────────
export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="tables">Tables</TabsTrigger>
        <TabsTrigger value="kitchen">Kitchen</TabsTrigger>
        <TabsTrigger value="menu">Menu</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <div className="p-4 border rounded-lg mt-2">
          <h3 className="font-semibold">Dashboard Overview</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Today's revenue: €2,450.00 | 48 orders | 12 active tables
          </p>
        </div>
      </TabsContent>
      <TabsContent value="tables">
        <div className="p-4 border rounded-lg mt-2">
          <h3 className="font-semibold">Table Management</h3>
          <p className="text-sm text-muted-foreground mt-1">
            12 occupied, 8 available tables
          </p>
        </div>
      </TabsContent>
      <TabsContent value="kitchen">
        <div className="p-4 border rounded-lg mt-2">
          <h3 className="font-semibold">Kitchen Display</h3>
          <p className="text-sm text-muted-foreground mt-1">
            5 orders in preparation, 2 ready for pickup
          </p>
        </div>
      </TabsContent>
      <TabsContent value="menu">
        <div className="p-4 border rounded-lg mt-2">
          <h3 className="font-semibold">Menu Management</h3>
          <p className="text-sm text-muted-foreground mt-1">
            156 items across 8 courses
          </p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

// ── Compact Tabs ─────────────────────────────────────────
export const CompactTabs: Story = {
  render: () => (
    <Tabs defaultValue="today">
      <TabsList>
        <TabsTrigger value="today">Today</TabsTrigger>
        <TabsTrigger value="week">This Week</TabsTrigger>
        <TabsTrigger value="month">This Month</TabsTrigger>
      </TabsList>
    </Tabs>
  ),
  parameters: {
    docs: {
      description: {
        story: "Compact period selector tabs as used in reports and dashboard views.",
      },
    },
  },
};

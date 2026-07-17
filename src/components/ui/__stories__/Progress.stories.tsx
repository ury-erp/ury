import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Progress } from "@/components/ui/progress";

const meta: Meta<typeof Progress> = {
  title: "UI/Progress",
  component: Progress,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Progress indicator used in the URY Dashboard for shift progress, daily targets, table occupancy, and loading states.",
      },
    },
  },
  argTypes: {
    value: {
      control: { type: "range", min: 0, max: 100, step: 1 },
      description: "Progress value (0-100)",
    },
  },
};

export default meta;
type Story = StoryObj<typeof Progress>;

// ── Default ──────────────────────────────────────────────
export const Default: Story = {
  args: {
    value: 60,
  },
};

// ── Progress Levels ──────────────────────────────────────
export const ProgressLevels: Story = {
  render: () => (
    <div className="w-[400px] space-y-4">
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span>Daily Target</span>
          <span className="text-muted-foreground">25%</span>
        </div>
        <Progress value={25} />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span>Shift Progress</span>
          <span className="text-muted-foreground">50%</span>
        </div>
        <Progress value={50} />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span>Table Occupancy</span>
          <span className="text-muted-foreground">75%</span>
        </div>
        <Progress value={75} />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span>Monthly Revenue</span>
          <span className="text-muted-foreground">90%</span>
        </div>
        <Progress value={90} />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Progress bars at different fill levels, demonstrating how they appear in dashboard contexts.",
      },
    },
  },
};

// ── Zero Progress ────────────────────────────────────────
export const Zero: Story = {
  args: {
    value: 0,
  },
};

// ── Complete ─────────────────────────────────────────────
export const Complete: Story = {
  args: {
    value: 100,
  },
};

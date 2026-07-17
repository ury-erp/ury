import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "@/components/ui/badge";

const meta: Meta<typeof Badge> = {
  title: "UI/Badge",
  component: Badge,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A small status indicator badge used for order states, table status, menu item availability, and category labels in the URY Dashboard.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline"],
      description: "Visual variant of the badge",
      table: {
        defaultValue: { summary: "default" },
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

// ── Default ──────────────────────────────────────────────
export const Default: Story = {
  args: {
    children: "Badge",
  },
};

// ── All Variants ─────────────────────────────────────────
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};

// ── Order Status Badges ─────────────────────────────────
export const OrderStatusBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center">
      <Badge variant="default">New</Badge>
      <Badge variant="secondary">Preparing</Badge>
      <Badge variant="outline">Ready</Badge>
      <Badge variant="destructive">Cancelled</Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Badges representing different order statuses as used in the kitchen display.",
      },
    },
  },
};

// ── Table Status Badges ─────────────────────────────────
export const TableStatusBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center">
      <Badge variant="default">Occupied</Badge>
      <Badge variant="secondary">Reserved</Badge>
      <Badge variant="outline">Available</Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Badges representing table occupancy states as shown on the tables tab.",
      },
    },
  },
};

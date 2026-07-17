import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "../badge";

const meta: Meta<typeof Badge> = {
  title: "UI/Badge",
  component: Badge,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Badge component for the URY POS system. Includes POS-specific variants for order status (pending, completed, cancelled) and contextual colors (success, warning, danger, info).",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default", "secondary", "destructive", "outline",
        "success", "warning", "danger", "info",
        "pending", "completed", "cancelled",
      ],
      table: { defaultValue: { summary: "default" } },
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg"],
      table: { defaultValue: { summary: "default" } },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: {
    children: "Badge",
  },
};

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

export const ContextualVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center">
      <Badge variant="success">Available</Badge>
      <Badge variant="warning">Low Stock</Badge>
      <Badge variant="danger">Out of Stock</Badge>
      <Badge variant="info">Info</Badge>
    </div>
  ),
};

export const OrderStatusBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center">
      <Badge variant="pending">Pending</Badge>
      <Badge variant="completed">Completed</Badge>
      <Badge variant="cancelled">Cancelled</Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Order status badges as used throughout the URY POS system.",
      },
    },
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center">
      <Badge size="sm">Small</Badge>
      <Badge size="default">Default</Badge>
      <Badge size="lg">Large</Badge>
    </div>
  ),
};

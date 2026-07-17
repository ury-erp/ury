import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "../button";

const meta: Meta<typeof Button> = {
  title: "UI/Button",
  component: Button,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Core button component for the URY POS system. Supports multiple variants including contextual colors (success, warning, danger) and standard variants. Built with CVA for variant management.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "destructive",
        "outline",
        "secondary",
        "ghost",
        "link",
        "tab",
        "success",
        "warning",
        "danger",
      ],
      description: "Visual variant of the button",
      table: {
        defaultValue: { summary: "default" },
      },
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon", "xs"],
      description: "Size of the button",
      table: {
        defaultValue: { summary: "default" },
      },
    },
    disabled: {
      control: "boolean",
      description: "Whether the button is disabled",
    },
  },
  args: {
    onClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: {
    children: "Button",
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center">
      <Button variant="default">Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Standard button variants for general UI interactions.",
      },
    },
  },
};

export const ContextualVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center">
      <Button variant="success">Confirm Order</Button>
      <Button variant="warning">Hold Order</Button>
      <Button variant="danger">Cancel Order</Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Contextual variants specific to the URY POS system for order and action feedback.",
      },
    },
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center">
      <Button size="xs">Extra Small</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
    children: "Disabled Button",
  },
};

export const POSActions: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="success" size="lg">
        Pay Now
      </Button>
      <Button variant="outline" size="lg">
        Add Note
      </Button>
      <Button variant="danger" size="sm">
        Void
      </Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Button combinations as they appear in the POS payment interface.",
      },
    },
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "../input";

const meta: Meta<typeof Input> = {
  title: "UI/Input",
  component: Input,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Input component for the URY POS system. Supports multiple variants including error, success, and search styles. Built with CVA for variant management and compatible with standard HTML input attributes.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "error", "success", "search"],
      description: "Visual variant of the input",
      table: { defaultValue: { summary: "default" } },
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg"],
      description: "Size of the input field",
      table: { defaultValue: { summary: "default" } },
    },
    disabled: {
      control: "boolean",
      description: "Whether the input is disabled",
    },
    placeholder: {
      control: "text",
      description: "Placeholder text",
    },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: {
    placeholder: "Enter text...",
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <Input variant="default" placeholder="Default input" />
      <Input variant="error" placeholder="Error state" />
      <Input variant="success" placeholder="Success state" />
      <Input variant="search" placeholder="Search menu items..." />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "All input variants including contextual states for form validation feedback.",
      },
    },
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <Input size="sm" placeholder="Small input" />
      <Input size="default" placeholder="Default input" />
      <Input size="lg" placeholder="Large input" />
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
    placeholder: "Disabled input",
    value: "Cannot edit this",
  },
};

export const POSInputs: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <Input variant="search" placeholder="Search menu..." />
      <Input variant="default" placeholder="Customer name" />
      <Input variant="default" type="number" placeholder="Quantity" />
      <Input variant="error" placeholder="Invalid discount code" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Input fields as they appear in the POS interface for order entry and search.",
      },
    },
  },
};

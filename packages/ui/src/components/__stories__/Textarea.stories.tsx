import type { Meta, StoryObj } from "@storybook/react-vite";
import { Textarea } from "../textarea";

const meta: Meta<typeof Textarea> = {
  title: "UI/Textarea",
  component: Textarea,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Textarea component for the URY POS system. Used for order notes, special instructions, and multi-line text input throughout the dashboard and POS interface.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "error"],
      description: "Visual variant of the textarea",
      table: { defaultValue: { summary: "default" } },
    },
    disabled: {
      control: "boolean",
      description: "Whether the textarea is disabled",
    },
    placeholder: {
      control: "text",
      description: "Placeholder text",
    },
  },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: {
    placeholder: "Enter notes...",
  },
};

export const WithError: Story = {
  args: {
    variant: "error",
    placeholder: "Please fix the errors above",
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    placeholder: "Cannot edit",
    value: "This textarea is disabled and cannot be modified.",
  },
};

export const OrderNotes: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-96">
      <Textarea
        placeholder="Special instructions for the kitchen..."
        rows={3}
      />
      <Textarea
        placeholder="Allergy notes..."
        variant="error"
        rows={2}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Textarea fields as used for order notes and kitchen instructions in the POS system.",
      },
    },
  },
};

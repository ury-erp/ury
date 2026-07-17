import type { Meta, StoryObj } from "@storybook/react-vite";
import { Spinner } from "../spinner";

const meta: Meta<typeof Spinner> = {
  title: "UI/Spinner",
  component: Spinner,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Spinner component for the URY POS system. A lightweight inline loading indicator used inside buttons, cards, and other compact UI elements.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Spinner>;

export const Default: Story = {
  args: {},
};

export const WithMessage: Story = {
  args: {
    message: "Processing payment...",
  },
};

export const InlineUsage: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Spinner />
      <span className="text-sm text-muted-foreground">Syncing data...</span>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Inline spinner usage for showing loading state within text content.",
      },
    },
  },
};

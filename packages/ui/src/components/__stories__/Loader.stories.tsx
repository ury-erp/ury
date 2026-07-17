import type { Meta, StoryObj } from "@storybook/react-vite";
import Loader from "../loader";

const meta: Meta<typeof Loader> = {
  title: "UI/Loader",
  component: Loader,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Loader component for the URY POS system. Displays a loading indicator for async operations like fetching orders, syncing data, or loading menu items.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Loader>;

export const Default: Story = {
  args: {},
};

export const WithCustomLabel: Story = {
  args: {
    message: "Loading orders...",
  },
  parameters: {
    docs: {
      description: {
        story: "Loader with a custom message for better UX during async operations.",
      },
    },
  },
};

export const FullPageLoader: Story = {
  render: () => (
    <div className="flex items-center justify-center w-full h-64 bg-gray-50 rounded-lg">
      <Loader message="Loading dashboard..." />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Full-page loading state as used when the POS dashboard initializes.",
      },
    },
  },
};

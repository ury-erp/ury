import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { Button } from "@/components/ui/button";

const meta: Meta<typeof Button> = {
  title: "UI/Button",
  component: Button,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A versatile button component with multiple variants and sizes. Built on top of Radix UI Slot and CVA for variant management. Used throughout the URY Dashboard for all interactive actions.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "outline", "secondary", "ghost", "link"],
      description: "Visual variant of the button",
      table: {
        defaultValue: { summary: "default" },
      },
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon"],
      description: "Size of the button",
      table: {
        defaultValue: { summary: "default" },
      },
    },
    disabled: {
      control: "boolean",
      description: "Whether the button is disabled",
    },
    asChild: {
      control: "boolean",
      description: "Render as child element (Slot pattern)",
      table: {
        defaultValue: { summary: "false" },
      },
    },
  },
  args: {
    onClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

// ── Default ──────────────────────────────────────────────
export const Default: Story = {
  args: {
    children: "Button",
  },
};

// ── All Variants ─────────────────────────────────────────
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center">
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
        story: "All six button variants displayed together for easy comparison.",
      },
    },
  },
};

// ── All Sizes ────────────────────────────────────────────
export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

// ── Destructive ──────────────────────────────────────────
export const Destructive: Story = {
  args: {
    variant: "destructive",
    children: "Delete Item",
  },
};

// ── Outline ──────────────────────────────────────────────
export const Outline: Story = {
  args: {
    variant: "outline",
    children: "Cancel",
  },
};

// ── Ghost ────────────────────────────────────────────────
export const Ghost: Story = {
  args: {
    variant: "ghost",
    children: "Ghost Button",
  },
};

// ── Disabled ─────────────────────────────────────────────
export const Disabled: Story = {
  args: {
    disabled: true,
    children: "Disabled Button",
  },
};

// ── With Icon ────────────────────────────────────────────
export const WithIcon: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        Add Item
      </Button>
      <Button variant="outline">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
        Download
      </Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Buttons with inline SVG icons. Icons are automatically sized and spaced.",
      },
    },
  },
};

// ── Icon Only ────────────────────────────────────────────
export const IconOnly: Story = {
  render: () => (
    <Button size="icon" variant="outline">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
    </Button>
  ),
};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const meta: Meta<typeof Card> = {
  title: "UI/Card",
  component: Card,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A flexible card component for displaying grouped content. Used throughout the URY Dashboard for dashboard panels, order summaries, menu items, and statistics displays.",
      },
    },
  },
  argTypes: {
    className: {
      control: "text",
      description: "Additional CSS classes",
    },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-[380px]">
      <CardHeader>
        <CardTitle>Today&apos;s Sales</CardTitle>
        <CardDescription>Total revenue for today</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">2,450.00 EUR</div>
        <p className="text-sm text-muted-foreground mt-1">
          +12.5% from yesterday
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full">
          View Details
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Card className="w-[380px]">
      <CardHeader>
        <CardTitle>Kitchen Orders</CardTitle>
        <CardDescription>Active orders in the kitchen</CardDescription>
        <CardAction>
          <Button size="sm" variant="outline">
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm">Order #1024</span>
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
              Preparing
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">Order #1025</span>
            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
              Ready
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">Order #1026</span>
            <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
              Delayed
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  ),
};

export const StatisticsCard: Story = {
  render: () => (
    <Card className="w-[200px]">
      <CardHeader>
        <CardDescription>Active Tables</CardDescription>
        <CardTitle className="text-3xl">12 / 20</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xs text-muted-foreground">
          8 tables available
        </div>
      </CardContent>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        story: "Compact statistics card as used on the dashboard overview page.",
      },
    },
  },
};

export const Simple: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Menu Management</CardTitle>
        <CardDescription>
          Add, edit, and organize your restaurant menu items.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Manage courses, prices, availability, and item details across all your restaurant locations.
        </p>
      </CardContent>
    </Card>
  ),
};

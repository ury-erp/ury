import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

const meta: Meta = {
  title: "Dashboard/OverviewCards",
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Overview dashboard cards showing key restaurant metrics. These are the primary information displays on the URY Dashboard main view.",
      },
    },
  },
};

export default meta;
type Story = StoryObj;

export const RevenueCard: Story = {
  name: "Revenue Card",
  render: () => (
    <Card className="w-[320px]">
      <CardHeader>
        <CardDescription>Today Revenue</CardDescription>
        <CardTitle className="text-4xl">2,450.00 EUR</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-green-600 font-medium">+12.5%</span>
          <span className="text-muted-foreground">vs yesterday</span>
        </div>
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Daily target</span>
            <span>75%</span>
          </div>
          <Progress value={75} />
        </div>
      </CardContent>
    </Card>
  ),
};

export const OrdersCard: Story = {
  name: "Orders Card",
  render: () => (
    <Card className="w-[320px]">
      <CardHeader>
        <CardDescription>Total Orders</CardDescription>
        <CardTitle className="text-4xl">48</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-green-600 font-medium">+8</span>
          <span className="text-muted-foreground">vs yesterday</span>
        </div>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Dine-in</span>
            <Badge variant="default">28</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Takeaway</span>
            <Badge variant="secondary">12</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Delivery</span>
            <Badge variant="outline">8</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  ),
};

export const TablesCard: Story = {
  name: "Tables Card",
  render: () => (
    <Card className="w-[320px]">
      <CardHeader>
        <CardDescription>Table Occupancy</CardDescription>
        <CardTitle className="text-4xl">12 / 20</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mt-1 space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Occupancy rate</span>
            <span>60%</span>
          </div>
          <Progress value={60} />
        </div>
        <div className="mt-3 flex gap-2">
          <Badge variant="default">12 Occupied</Badge>
          <Badge variant="outline">8 Available</Badge>
        </div>
      </CardContent>
    </Card>
  ),
};

export const KitchenStatusCard: Story = {
  name: "Kitchen Status Card",
  render: () => (
    <Card className="w-[320px]">
      <CardHeader>
        <CardDescription>Kitchen Status</CardDescription>
        <CardTitle className="text-2xl">5 Orders</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Preparing</span>
            <Badge variant="secondary">3</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Ready for Pickup</span>
            <Badge variant="default">2</Badge>
          </div>
        </div>
        <Button variant="outline" className="w-full mt-4" size="sm">
          View Kitchen Display
        </Button>
      </CardContent>
    </Card>
  ),
};

export const DashboardGrid: Story = {
  name: "Dashboard Grid",
  render: () => (
    <div className="grid grid-cols-2 gap-4 w-[700px]">
      <Card>
        <CardHeader>
          <CardDescription>Today Revenue</CardDescription>
          <CardTitle className="text-3xl">2,450.00 EUR</CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-sm text-green-600 font-medium">+12.5%</span>
          <span className="text-sm text-muted-foreground ml-1">vs yesterday</span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Total Orders</CardDescription>
          <CardTitle className="text-3xl">48</CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-sm text-green-600 font-medium">+8</span>
          <span className="text-sm text-muted-foreground ml-1">vs yesterday</span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Table Occupancy</CardDescription>
          <CardTitle className="text-3xl">12 / 20</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={60} className="mt-1" />
          <span className="text-xs text-muted-foreground mt-1 block">60% occupied</span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Avg. Order Value</CardDescription>
          <CardTitle className="text-3xl">51.04 EUR</CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-sm text-red-600 font-medium">-3.2%</span>
          <span className="text-sm text-muted-foreground ml-1">vs yesterday</span>
        </CardContent>
      </Card>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Full dashboard grid layout showing all key metrics at a glance, as they appear on the overview page.",
      },
    },
  },
};

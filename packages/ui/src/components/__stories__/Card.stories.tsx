import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../card";
import { Button } from "../button";

const meta: Meta<typeof Card> = {
  title: "UI/Card",
  component: Card,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Card component for the URY POS system. Supports variants (default, elevated, outlined, ghost) and padding options. Used for order panels, menu items, and dashboard sections.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "elevated", "outlined", "ghost"],
      table: { defaultValue: { summary: "default" } },
    },
    padding: {
      control: "select",
      options: ["none", "sm", "default", "lg", "xl"],
      table: { defaultValue: { summary: "default" } },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-[380px]">
      <CardHeader>
        <CardTitle>Order #1024</CardTitle>
        <CardDescription>Table 5 - Dine-in</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Pizza Margherita x2</span>
            <span>18.00 EUR</span>
          </div>
          <div className="flex justify-between">
            <span>Pasta Carbonara x1</span>
            <span>12.50 EUR</span>
          </div>
          <div className="flex justify-between font-bold pt-2 border-t">
            <span>Total</span>
            <span>30.50 EUR</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="success" className="w-full">
          Complete Payment
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Card variant="default" className="w-[200px] p-4">
        <CardTitle className="text-base">Default</CardTitle>
        <CardDescription>Standard card</CardDescription>
      </Card>
      <Card variant="elevated" className="w-[200px] p-4">
        <CardTitle className="text-base">Elevated</CardTitle>
        <CardDescription>With shadow</CardDescription>
      </Card>
      <Card variant="outlined" className="w-[200px] p-4">
        <CardTitle className="text-base">Outlined</CardTitle>
        <CardDescription>Bordered</CardDescription>
      </Card>
      <Card variant="ghost" className="w-[200px] p-4">
        <CardTitle className="text-base">Ghost</CardTitle>
        <CardDescription>No border</CardDescription>
      </Card>
    </div>
  ),
};

export const MenuCard: Story = {
  render: () => (
    <Card variant="outlined" className="w-[250px]">
      <CardHeader>
        <CardTitle className="text-lg">Pizza Margherita</CardTitle>
        <CardDescription>Main Course</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-bold text-primary">9.00 EUR</div>
      </CardContent>
      <CardFooter>
        <Button size="sm" variant="outline">
          Edit
        </Button>
        <Button size="sm" variant="danger" className="ml-2">
          Remove
        </Button>
      </CardFooter>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        story: "Card used for displaying menu items in the POS interface.",
      },
    },
  },
};

import type { Meta, StoryObj } from "@storybook/react";
import { useId } from "react";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

const meta: Meta<typeof Input> = {
  title: "Components/Input",
  component: Input,
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: { placeholder: "Enter text..." },
};

function InputWithLabel() {
  const id = useId();
  return (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor={id}>Email</Label>
      <Input type="email" id={id} placeholder="Email" />
    </div>
  );
}

export const WithLabel: Story = {
  render: () => <InputWithLabel />,
};

export const Disabled: Story = {
  args: { placeholder: "Disabled", disabled: true },
};

export const File: Story = {
  args: { type: "file" },
};

import { Button, Input } from "@kioskkit/ui";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ssid: string;
}

export function PasswordInput({
  value,
  onChange,
  disabled,
  placeholder,
  ssid,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative w-auto min-w-[300px]">
      <Input
        type={visible ? "text" : "password"}
        placeholder={placeholder ?? "Password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete="one-time-code"
        name={`wifi-password-${ssid}`}
        className="w-full pr-9"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-0 top-0 h-full px-2 hover:bg-transparent"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}

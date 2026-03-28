import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from "@kioskkit/ui";
import { type ChangeEvent, type FormEvent, useId, useState } from "react";
import { useClaimDevice } from "../hooks/devices.js";
import { useTranslate } from "../hooks/useTranslate.js";

function stripNonDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 9);
}

function formatPairingCode(digits: string): string {
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)];
  return parts.filter(Boolean).join("-");
}

export function AddDeviceDialog() {
  const t = useTranslate();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const claim = useClaimDevice();

  const digits = stripNonDigits(code);
  const isValid = /^\d{9}$/.test(digits);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setCode(e.target.value);
    if (claim.isError) claim.reset();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    claim.mutate(digits, {
      onSuccess: () => {
        setOpen(false);
        setCode("");
        claim.reset();
      },
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCode("");
      claim.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>{t("addDevice.button")}</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("addDevice.title")}</DialogTitle>
            <DialogDescription>{t("addDevice.description")}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor={inputId}>{t("addDevice.codeLabel")}</Label>
            <Input
              id={inputId}
              className="mt-2 text-center text-lg tracking-widest"
              placeholder="123-456-789"
              value={formatPairingCode(digits)}
              onChange={handleChange}
              autoFocus
              autoComplete="off"
              inputMode="numeric"
            />
            {claim.isError && (
              <p className="mt-2 text-sm text-destructive">{t("addDevice.error")}</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!isValid} loading={claim.isPending}>
              {t("addDevice.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

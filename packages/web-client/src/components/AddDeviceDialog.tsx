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
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@kioskkit/ui";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { type FormEvent, useState } from "react";
import { useClaimDevice } from "../hooks/devices.js";
import { useTranslate } from "../hooks/useTranslate.js";

export function AddDeviceDialog() {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const claim = useClaimDevice();

  const isValid = /^\d{9}$/.test(code);

  function handleChange(value: string) {
    setCode(value);
    if (claim.isError) claim.reset();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    claim.mutate(code, {
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
          <div className="flex flex-col items-center gap-2 py-4">
            <InputOTP
              maxLength={9}
              pattern={REGEXP_ONLY_DIGITS}
              value={code}
              onChange={handleChange}
              autoFocus
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={6} />
                <InputOTPSlot index={7} />
                <InputOTPSlot index={8} />
              </InputOTPGroup>
            </InputOTP>
            {claim.isError && <p className="text-sm text-destructive">{t("addDevice.error")}</p>}
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

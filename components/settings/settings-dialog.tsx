"use client";

import { Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LiaraSection } from "@/components/settings/liara-section";
import { AiSection } from "@/components/settings/ai-section";

export function SettingsDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="icon" aria-label="Settings" />}>
        <Settings />
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Connect your Liara account and AI provider. Secrets are encrypted on this server.
          </DialogDescription>
        </DialogHeader>
        <LiaraSection />
        <Separator />
        <AiSection />
      </DialogContent>
    </Dialog>
  );
}

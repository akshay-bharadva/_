"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NavLink } from "./navigation-page";

interface NavLinkFormProps {
  link: Partial<NavLink> | null;
  onSave: (data: Partial<NavLink>) => void;
  onCancel: () => void;
}

export function NavLinkForm({ link, onSave, onCancel }: NavLinkFormProps) {
  const [formData, setFormData] = useState({
    label: link?.label || "",
    href: link?.href || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...link, ...formData });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-1">
        <Label htmlFor="label">Label</Label>
        <Input
          id="label"
          value={formData.label}
          onChange={(e) => setFormData((f) => ({ ...f, label: e.target.value }))}
          required
          autoFocus
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="href">Path (e.g., /about)</Label>
        <Input
          id="href"
          value={formData.href}
          onChange={(e) => setFormData((f) => ({ ...f, href: e.target.value }))}
          required
        />
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save Link</Button>
      </div>
    </form>
  );
}

"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { navLinkSchema } from "@/lib/schemas";
import type { NavLink } from "./navigation-page";

/**
 * Only the two fields the owner edits. `display_order` and `is_visible` are
 * managed by the list (drag to reorder, switch to toggle), so validating the
 * whole `navLinkSchema` here would demand values this form never collects.
 */
const navLinkFormSchema = navLinkSchema.pick({ label: true, href: true });
type NavLinkFormValues = { label: string; href: string };

interface NavLinkFormProps {
  link: Partial<NavLink> | null;
  onSave: (data: Partial<NavLink>) => void;
  onCancel: () => void;
}

export function NavLinkForm({ link, onSave, onCancel }: NavLinkFormProps) {
  const form = useForm<NavLinkFormValues>({
    resolver: zodResolver(navLinkFormSchema),
    defaultValues: {
      label: link?.label ?? "",
      href: link?.href ?? "",
    },
  });

  const handleSubmit = (values: NavLinkFormValues) => {
    onSave({ ...link, ...values });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-4 pt-2"
      >
        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Label</FormLabel>
              <FormControl>
                <Input {...field} autoFocus />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="href"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Path</FormLabel>
              <FormControl>
                <Input {...field} placeholder="/about" className="font-mono" />
              </FormControl>
              <FormDescription>
                A path on this site. Each one becomes a page built from its CMS
                sections.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">Save Link</Button>
        </div>
      </form>
    </Form>
  );
}

"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { InventoryItem } from "@/types";
import {
  useAddInventoryItemMutation,
  useUpdateInventoryItemMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { Calendar } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, getErrorMessage, parseLocalDate } from "@/lib/utils";
import {
  inventoryItemSchema,
  type InventoryItemFormValues,
} from "@/lib/schemas";

type FormValues = InventoryItemFormValues;

const CATEGORIES = [
  { label: "Hardware", value: "Hardware" },
  { label: "Software", value: "Software" },
  { label: "Furniture", value: "Furniture" },
  { label: "Accessory", value: "Accessory" },
  { label: "Other", value: "Other" },
];

interface InventoryFormProps {
  item: InventoryItem | null;
  onSuccess: () => void;
}

function DateField({
  value,
  onChange,
}: {
  // Nullable: `purchase_date`/`warranty_expiry` are nullable DATE columns.
  value?: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <FormControl>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? (
              format(parseLocalDate(value), "PPP")
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </FormControl>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ? parseLocalDate(value) : undefined}
          onSelect={(date) => onChange(date ? format(date, "yyyy-MM-dd") : "")}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export function InventoryForm({ item, onSuccess }: InventoryFormProps) {
  const [addItem, { isLoading: isAdding }] = useAddInventoryItemMutation();
  const [updateItem, { isLoading: isUpdating }] =
    useUpdateInventoryItemMutation();
  const isLoading = isAdding || isUpdating;

  const form = useForm<FormValues>({
    resolver: zodResolver(inventoryItemSchema),
    // `??` throughout: a stored 0 is a real value. Under `||` an item marked as
    // fully depreciated read back as its original purchase price.
    defaultValues: {
      name: item?.name ?? "",
      category: item?.category ?? "",
      serial_number: item?.serial_number ?? "",
      purchase_price: item?.purchase_price ?? 0,
      current_value: item?.current_value ?? null,
      purchase_date: item?.purchase_date ?? "",
      warranty_expiry: item?.warranty_expiry ?? "",
      notes: item?.notes ?? "",
      image_url: item?.image_url ?? "",
    },
  });

  const handleSubmit = async (values: FormValues) => {
    try {
      const payload = {
        ...values,
        // Only fall back to the purchase price when no current value was given
        // at all. Previously `||` meant an explicit 0 was overwritten, so an
        // item could never be recorded as worthless.
        current_value: values.current_value ?? values.purchase_price,
        purchase_date: values.purchase_date || null,
        warranty_expiry: values.warranty_expiry || null,
      };

      if (item) {
        await updateItem({ id: item.id, ...payload }).unwrap();
        toast.success("Item updated");
      } else {
        await addItem(payload).unwrap();
        toast.success("Item added");
      }
      onSuccess();
    } catch (error: unknown) {
      toast.error("Failed to save item", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Item Name *</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. MacBook Pro M3" autoFocus />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category *</FormLabel>
                <FormControl>
                  <Combobox
                    options={CATEGORIES}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select category"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="serial_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Serial / License Key</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="purchase_price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Purchase Price ($)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="current_value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current Value ($)</FormLabel>
                <FormControl>
                  {/* Null means "not appraised" and must render as an empty
                      input, not as React's uncontrolled-input warning. */}
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Same as purchase price"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="purchase_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Purchase Date</FormLabel>
                <DateField value={field.value} onChange={field.onChange} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="warranty_expiry"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Warranty Expiry</FormLabel>
                <DateField value={field.value} onChange={field.onChange} />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={3}
                  placeholder="Condition, location, etc."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="image_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Image URL</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Link from Asset Manager..." />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            {item ? "Save Changes" : "Add Item"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Habit } from "@/types";
import { habitSchema, type HabitFormValues } from "@/lib/schemas";
import { DEFAULT_HABIT_COLOR, HABIT_COLORS } from "@/lib/constants";
import { useSaveHabitMutation } from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";

export function HabitForm({
  habit,
  onSuccess,
}: {
  habit: Partial<Habit> | null;
  onSuccess: () => void;
}) {
  const [saveHabit, { isLoading }] = useSaveHabitMutation();

  const form = useForm<HabitFormValues>({
    resolver: zodResolver(habitSchema),
    // `??` rather than `||`: a stored 0 is still a value the form should show
    // and let the resolver reject, not silently rewrite to the default.
    defaultValues: {
      title: habit?.title ?? "",
      color: habit?.color ?? DEFAULT_HABIT_COLOR,
      target_per_week: habit?.target_per_week ?? 7,
    },
  });

  const handleSubmit = async (values: HabitFormValues) => {
    try {
      await saveHabit({ id: habit?.id, ...values, is_active: true }).unwrap();
      toast.success("Habit saved successfully");
      onSuccess();
    } catch {
      toast.error("Failed to save habit");
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-4 pt-4"
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Habit Title</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g., Read 30 mins" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Color Code</FormLabel>
              <FormControl>
                <div className="flex items-center gap-3">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="size-10 rounded-full border-2 shadow-e1 ring-primary transition-transform hover:scale-105 focus:outline-none focus:ring-2 ring-offset-2"
                        style={{
                          backgroundColor: field.value,
                          borderColor: field.value,
                        }}
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-64">
                      {/* Buttons, not divs: these are the only way to pick a
                          colour without typing a hex code by hand, so they have
                          to be reachable by keyboard. */}
                      <div
                        className="grid grid-cols-4 gap-2"
                        role="group"
                        aria-label="Habit colour"
                      >
                        {HABIT_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => field.onChange(c)}
                            aria-label={`Use colour ${c}`}
                            aria-pressed={field.value === c}
                            className={cn(
                              "flex size-10 items-center justify-center rounded-full border-2 transition-all hover:scale-110",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                              field.value === c
                                ? "border-foreground"
                                : "border-transparent",
                            )}
                            style={{ backgroundColor: c }}
                          >
                            {field.value === c && (
                              <Check className="size-4 text-white drop-shadow-md" />
                            )}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Input
                    {...field}
                    aria-label="Colour hex code"
                    maxLength={7}
                    className="w-32 font-mono uppercase"
                    placeholder="#3b82f6"
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="target_per_week"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Weekly Target (Days)</FormLabel>
              <FormControl>
                <Input type="number" {...field} min={1} max={7} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save Habit
          </Button>
        </div>
      </form>
    </Form>
  );
}

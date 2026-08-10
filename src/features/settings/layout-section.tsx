"use client";

import { UseFormReturn } from "react-hook-form";
import { BookImage, Clock, LayoutDashboard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import type { SiteSettingsFormValues } from "@/lib/schemas";

export interface LayoutSectionProps {
  form: UseFormReturn<SiteSettingsFormValues>;
}

export function LayoutSection({ form }: LayoutSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutDashboard className="size-5 text-primary" /> Global Layout
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Portfolio Mode */}
        <div>
          <h4 className="mb-2 text-sm font-medium">Portfolio Mode</h4>
          <FormField
            control={form.control}
            name="portfolio_mode"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value}
                    className="flex flex-col gap-2"
                  >
                    <FormItem className="flex cursor-pointer items-center space-x-3 space-y-0 rounded-md border p-2 hover:bg-secondary/10">
                      <FormControl>
                        <RadioGroupItem value="multi-page" />
                      </FormControl>
                      <FormLabel className="flex-1 cursor-pointer font-normal">
                        Multi-Page
                      </FormLabel>
                    </FormItem>
                    <FormItem className="flex cursor-pointer items-center space-x-3 space-y-0 rounded-md border p-2 hover:bg-secondary/10">
                      <FormControl>
                        <RadioGroupItem value="single-page" />
                      </FormControl>
                      <FormLabel className="flex-1 cursor-pointer font-normal">
                        Single-Page
                      </FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* Updates Layout */}
        <div>
          <h4 className="mb-1 text-sm font-medium">Updates Page Layout</h4>
          <p className="mb-3 text-xs text-muted-foreground">
            Choose how life updates are displayed on the public page.
          </p>
          <FormField
            control={form.control}
            name="profile_data.updates_layout"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value || "scrapbook"}
                    className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                  >
                    <FormItem className="space-y-0">
                      <FormControl>
                        <RadioGroupItem
                          value="scrapbook"
                          className="peer sr-only"
                        />
                      </FormControl>
                      <FormLabel className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors hover:bg-secondary/10 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5">
                        <BookImage className="size-8 text-muted-foreground peer-data-[state=checked]:text-primary" />
                        <div className="text-center">
                          <p className="text-sm font-medium">Scrapbook</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Polaroid cards with washi tape and random rotations
                          </p>
                        </div>
                      </FormLabel>
                    </FormItem>

                    <FormItem className="space-y-0">
                      <FormControl>
                        <RadioGroupItem
                          value="timeline"
                          className="peer sr-only"
                        />
                      </FormControl>
                      <FormLabel className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors hover:bg-secondary/10 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5">
                        <Clock className="size-8 text-muted-foreground peer-data-[state=checked]:text-primary" />
                        <div className="text-center">
                          <p className="text-sm font-medium">Timeline</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Chronological feed with month grouping and colored
                            dots
                          </p>
                        </div>
                      </FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Save } from "lucide-react";
import {
  useGetSiteSettingsQuery,
  useUpdateSiteSettingsMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  siteSettingsDefaultValues,
  siteSettingsSchema,
  type SiteSettingsFormValues,
} from "@/lib/schemas";
import { getErrorMessage } from "@/lib/utils";
import { ManagerWrapper, PageHeader } from "@/components/admin/shared";
import { SettingsSkeleton } from "./settings-skeleton";
import { BrandIdentitySection } from "./brand-identity-section";
import { HeroAboutSection } from "./hero-about-section";
import { GitHubSection } from "./github-section";
import { ThemeSection } from "./theme-section";
import { TypographySection } from "./typography-section";
import { SocialLinksSection } from "./social-links-section";
import { StatusPanelSection } from "./status-panel-section";
import { LayoutSection } from "./layout-section";
import { FooterSection } from "./footer-section";
import { ContactPageSection } from "./contact-page-section";

// How many inputs each section renders for its string array. Kept next to the
// form because it is the form layout, not the schema, that fixes these counts:
// HeroAboutSection renders bio.0/bio.1, StatusPanelSection items.0/items.1.
const BIO_SLOTS = 2;
const EXPLORING_SLOTS = 2;

export default function SettingsPage() {
  const { data: settingsData, isLoading: isLoadingSettings } =
    useGetSiteSettingsQuery();
  const [updateSiteSettings, { isLoading: isSubmitting }] =
    useUpdateSiteSettingsMutation();

  const form = useForm<SiteSettingsFormValues>({
    resolver: zodResolver(siteSettingsSchema),
    defaultValues: siteSettingsDefaultValues,
  });

  useEffect(() => {
    if (settingsData) {
      // Helper to convert nulls to empty strings for form compatibility
      const nullsToStrings = (obj: any): any => {
        if (obj === null || obj === undefined) return "";
        if (typeof obj !== "object") return obj;
        if (Array.isArray(obj)) return obj.map(nullsToStrings);
        return Object.fromEntries(
          Object.entries(obj).map(([key, value]) => [
            key,
            nullsToStrings(value),
          ]),
        );
      };
      const cleanIdentity = nullsToStrings(settingsData);

      // The form exposes a fixed number of inputs per string array (two bio
      // paragraphs, two "exploring" entries). Handing it a shorter array leaves
      // those trailing fields with no entry in defaultValues, so registering
      // them writes `undefined` into the form values and the array grows past
      // its default — which react-hook-form reads as a dirty form the moment
      // the page loads, and renders the input as uncontrolled (empty) instead
      // of showing the stored value. Pad to exactly what the UI renders.
      const padTo = (value: unknown, count: number): string[] => {
        const list = Array.isArray(value) ? value : [];
        return Array.from({ length: count }, (_, i) => list[i] ?? "");
      };

      const fetchedSocials =
        (cleanIdentity.social_links as {
          id: string;
          label: string;
          url: string;
          is_visible: boolean;
        }[]) || [];
      const mergedSocials = (siteSettingsDefaultValues.social_links || []).map(
        (def) => {
          const fetched = fetchedSocials.find((f) => f.id === def.id);
          return fetched ? { ...def, ...fetched } : def;
        },
      );

      const fetchedColors =
        cleanIdentity.profile_data.custom_theme_colors || {};
      const defaultColors =
        siteSettingsDefaultValues.profile_data.custom_theme_colors!;
      const mergedColors = {
        background: fetchedColors.background || defaultColors.background,
        foreground: fetchedColors.foreground || defaultColors.foreground,
        primary: fetchedColors.primary || defaultColors.primary,
        secondary: fetchedColors.secondary || defaultColors.secondary,
        accent: fetchedColors.accent || defaultColors.accent,
        card: fetchedColors.card || defaultColors.card,
      };

      const mergedProfileData = {
        ...siteSettingsDefaultValues.profile_data,
        ...cleanIdentity.profile_data,
        custom_theme_colors: mergedColors,
        logo: {
          ...siteSettingsDefaultValues.profile_data.logo,
          ...(cleanIdentity.profile_data.logo || {}),
        },
        status_panel: {
          ...siteSettingsDefaultValues.profile_data.status_panel,
          ...(cleanIdentity.profile_data.status_panel || {}),
          show: cleanIdentity.profile_data.status_panel?.show ?? true,
          currently_exploring: {
            ...siteSettingsDefaultValues.profile_data.status_panel
              .currently_exploring,
            ...(cleanIdentity.profile_data.status_panel?.currently_exploring ||
              {}),
            items: padTo(
              cleanIdentity.profile_data.status_panel?.currently_exploring
                ?.items,
              EXPLORING_SLOTS,
            ),
          },
          latestProject: {
            ...siteSettingsDefaultValues.profile_data.status_panel
              .latestProject,
            ...(cleanIdentity.profile_data.status_panel?.latestProject || {}),
          },
        },
        github_projects_config: {
          ...siteSettingsDefaultValues.profile_data.github_projects_config,
          ...(cleanIdentity.profile_data.github_projects_config || {}),
        },
        contact_page: {
          ...siteSettingsDefaultValues.profile_data.contact_page,
          ...(cleanIdentity.profile_data.contact_page || {}),
        },
        bio: padTo(cleanIdentity.profile_data.bio, BIO_SLOTS),
      };

      form.reset({
        portfolio_mode: settingsData.portfolio_mode || "multi-page",
        profile_data: mergedProfileData,
        social_links: mergedSocials,
        footer_data:
          cleanIdentity.footer_data || siteSettingsDefaultValues.footer_data,
      });
    }
  }, [settingsData, form]);

  const onSubmit = async (values: SiteSettingsFormValues) => {
    // The padding above is a form-layout concern; don't persist the blank
    // slots, or the public About page renders an empty paragraph for each one.
    // (`currently_exploring.items` is already filtered by its schema transform.)
    const bio = values.profile_data.bio.filter((p) => p.trim() !== "");
    const payload: SiteSettingsFormValues = {
      ...values,
      profile_data: {
        ...values.profile_data,
        bio: bio.length ? bio : [""],
      },
    };

    try {
      await updateSiteSettings(payload).unwrap();
      toast.success("Site settings updated successfully!");
    } catch (err) {
      toast.error("Failed to save settings", {
        description: getErrorMessage(err),
      });
    }
  };

  const isDirty = form.formState.isDirty;

  if (isLoadingSettings) return <SettingsSkeleton />;

  return (
    <ManagerWrapper className="pb-24">
      <PageHeader
        title="Site Settings"
        description="Manage global settings for your portfolio's identity and layout."
        actions={
          <Button
            onClick={form.handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className="w-full shadow-e2 sm:w-auto"
          >
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}{" "}
            Save Changes
          </Button>
        }
      />

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-1 lg:grid-cols-3"
        >
          {/* Left Column — Identity & Content */}
          <div className="space-y-6 lg:col-span-2">
            <BrandIdentitySection form={form} />
            <HeroAboutSection form={form} />
            <ThemeSection form={form} />
            <TypographySection form={form} />
            <SocialLinksSection form={form} />
          </div>

          {/* Right Column — Layout & Features */}
          <div className="space-y-6 lg:col-span-1">
            <LayoutSection form={form} />
            <StatusPanelSection form={form} />
            <GitHubSection form={form} />
            <ContactPageSection form={form} />
            <FooterSection form={form} />
          </div>
        </form>
      </Form>

      {/* Sticky Save Banner */}
      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] backdrop-blur-md"
          >
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
              <p className="text-sm text-muted-foreground">
                You have unsaved changes
              </p>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => form.reset()}
                  disabled={isSubmitting}
                >
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 size-4" />
                  )}
                  Save Changes
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </ManagerWrapper>
  );
}

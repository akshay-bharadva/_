"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, Loader2, RotateCcw, Save } from "lucide-react";
import {
  useGetSiteSettingsQuery,
  useUpdateSiteSettingsMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  siteSettingsDefaultValues,
  siteSettingsSchema,
  type SiteSettingsFormValues,
} from "@/lib/schemas";
import { normalizeSiteContent } from "@/lib/site-identity";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { ManagerWrapper } from "@/components/admin/shared";
import { SettingsSkeleton } from "./settings-skeleton";
import { SettingsNav } from "./settings-nav";
import { SettingsPreviewLazy } from "./settings-preview-lazy";
import {
  DEFAULT_GROUP_ID,
  SETTINGS_GROUPS,
  findGroup,
  type PreviewPage,
  type SettingsGroup,
} from "./settings-groups";
import {
  buildGroupPayload,
  getAtPath,
  groupIsDirty,
  issuesForGroup,
} from "./settings-payload";
import { BrandSection } from "./brand-section";
import { HeroSection } from "./hero-section";
import { SocialLinksSection } from "./social-links-section";
import { ThemeSection } from "./theme-section";
import { TypographySection } from "./typography-section";
import { LayoutSection } from "./layout-section";
import { StatusPanelSection } from "./status-panel-section";
import { GitHubSection } from "./github-section";
import { ContactPageSection } from "./contact-page-section";
import { FooterSection } from "./footer-section";
import type { SettingsForm } from "./settings-controls";

/**
 * Site settings, as a navigator with a live preview.
 *
 * Three things about the shape, each replacing something the previous screen
 * got wrong:
 *
 * - **One group at a time.** Ten cards in a two-column grid meant a long scroll
 *   with no sense of place. The registry in `settings-groups.ts` drives the
 *   rail, the search, and what each Save touches.
 *
 * - **Per-group save.** The old screen ran one resolver over one submit, so an
 *   invalid GitHub username blocked fixing a footer typo. Validation is now
 *   scoped with `issuesForGroup`, and the write with `buildGroupPayload` — so
 *   saving one group never persists another group's half-finished edit.
 *
 * - **A live preview.** Theme, typography, status-panel design and the contact
 *   toggles were all chosen from dropdown labels and verified by opening the
 *   public site in another tab.
 */

const SECTION_BY_GROUP: Record<
  string,
  (props: { form: SettingsForm }) => JSX.Element
> = {
  brand: BrandSection,
  hero: HeroSection,
  social: SocialLinksSection,
  theme: ThemeSection,
  typography: TypographySection,
  layout: LayoutSection,
  status: StatusPanelSection,
  github: GitHubSection,
  contact: ContactPageSection,
  footer: FooterSection,
};

export default function SettingsPage() {
  const { data: settingsData, isLoading } = useGetSiteSettingsQuery();
  const [updateSiteSettings, { isLoading: isSaving }] =
    useUpdateSiteSettingsMutation();

  const [activeId, setActiveId] = useState(DEFAULT_GROUP_ID);
  const [search, setSearch] = useState("");
  const [previewPage, setPreviewPage] = useState<PreviewPage>("home");
  const [invalidIds, setInvalidIds] = useState<ReadonlySet<string>>(new Set());

  const form = useForm<SiteSettingsFormValues>({
    resolver: zodResolver(siteSettingsSchema),
    defaultValues: siteSettingsDefaultValues,
    mode: "onBlur",
  });

  /**
   * The last state the server confirmed, and the baseline every dirty check and
   * partial write is measured against.
   *
   * This used to be a sixty-line `useEffect` that scrubbed nulls, merged three
   * levels of defaults by hand and padded two arrays to the number of inputs
   * the form drew. `normalizeSiteContent` already answered the same question
   * for the public site; the admin now asks the same function.
   */
  const serverState = useMemo(
    () =>
      settingsData
        ? (normalizeSiteContent(
            settingsData,
          ) as unknown as SiteSettingsFormValues)
        : null,
    [settingsData],
  );

  /**
   * `false` until the row has been loaded into the form.
   *
   * Between the first render and this effect the form still holds
   * `siteSettingsDefaultValues` while `serverState` holds the real row, so
   * every group compares as dirty and the save bar flashes up for a frame on
   * every visit. Nothing is dirty before the form has been filled.
   */
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!serverState) return;
    form.reset(serverState);
    setHydrated(true);
  }, [serverState, form]);

  const values = form.watch();
  const group = findGroup(activeId);

  useEffect(() => {
    if (group.preview) setPreviewPage(group.preview);
  }, [group.preview]);

  const dirtyIds = useMemo(() => {
    if (!serverState || !hydrated) return new Set<string>();
    return new Set(
      SETTINGS_GROUPS.filter((candidate) =>
        groupIsDirty(serverState, values, candidate.fields),
      ).map((candidate) => candidate.id),
    );
  }, [serverState, values, hydrated]);

  const isDirty = dirtyIds.has(group.id);
  // The bar is up whenever *any* group is dirty, not only the one on screen —
  // otherwise navigating away from an edited group hides the only control that
  // would save it.
  const anyDirty = dirtyIds.size > 0;

  /**
   * Save one or more groups in a single write.
   *
   * Taking a list rather than always the active group is what makes "Save all"
   * one round trip instead of N: the payload is every named group's fields laid
   * over the server row at once, so the columns are written once and cannot be
   * left half-applied if a later request fails.
   *
   * A group whose fields fail validation is dropped from the write rather than
   * failing the whole thing — the same rule as the single-group case, applied
   * across the set. Skipping it is reported; it is never silently ignored.
   */
  const saveGroups = useCallback(
    async (targets: readonly SettingsGroup[]) => {
      if (!serverState || targets.length === 0) return;

      const current = form.getValues();
      const parsed = siteSettingsSchema.safeParse(current);
      const issues = parsed.success ? [] : parsed.error.issues;

      const blocked = targets.filter(
        (target) => issuesForGroup(issues, target.fields).length > 0,
      );
      const savable = targets.filter((target) => !blocked.includes(target));

      form.clearErrors();
      for (const target of blocked) {
        for (const issue of issuesForGroup(issues, target.fields)) {
          form.setError(issue.path.join(".") as never, {
            type: "validate",
            message: issue.message,
          });
        }
      }

      setInvalidIds((previous) => {
        const next = new Set(previous);
        for (const target of targets) next.delete(target.id);
        for (const target of blocked) next.add(target.id);
        return next;
      });

      const describeBlocked = () =>
        blocked.map((target) => target.label).join(", ");

      if (savable.length === 0) {
        const first = issuesForGroup(issues, blocked[0].fields)[0];
        // Send the reader to the group that is actually wrong, since with
        // "Save all" it may not be the one on screen.
        setActiveId(blocked[0].id);
        toast.error(`${describeBlocked()} needs fixing`, {
          description: first.message,
        });
        return;
      }

      // Take the validated shape when the whole form parses (it strips blank
      // list rows), and the raw values when it does not, since a failure
      // elsewhere must not stop these groups from being written.
      const source = parsed.success
        ? (parsed.data as SiteSettingsFormValues)
        : current;

      const fields = savable.flatMap((target) => [...target.fields]);
      const payload = buildGroupPayload(serverState, source, fields);

      try {
        await updateSiteSettings(payload).unwrap();
        toast.success(
          savable.length === 1
            ? `${savable[0].label} saved`
            : `Saved ${savable.length} groups`,
        );
        if (blocked.length > 0) {
          toast.error(`${describeBlocked()} was not saved`, {
            description: "Fix the highlighted fields and save again.",
          });
        }
      } catch (error) {
        toast.error("Could not save", { description: getErrorMessage(error) });
      }
    },
    [form, serverState, updateSiteSettings],
  );

  const saveGroup = useCallback(() => saveGroups([group]), [saveGroups, group]);

  const dirtyGroups = useMemo(
    () => SETTINGS_GROUPS.filter((candidate) => dirtyIds.has(candidate.id)),
    [dirtyIds],
  );

  /** Put the named groups' fields back to the last saved values. */
  const revertGroups = useCallback(
    (targets: readonly SettingsGroup[]) => {
      if (!serverState) return;
      for (const target of targets) {
        for (const path of target.fields) {
          form.setValue(path as never, getAtPath(serverState, path) as never, {
            shouldDirty: false,
            shouldValidate: false,
          });
        }
      }
      setInvalidIds((previous) => {
        const next = new Set(previous);
        for (const target of targets) next.delete(target.id);
        return next;
      });
      form.clearErrors();
    },
    [form, serverState],
  );

  const revertGroup = useCallback(
    () => revertGroups([group]),
    [revertGroups, group],
  );

  const revertAll = useCallback(
    () => revertGroups(dirtyGroups),
    [revertGroups, dirtyGroups],
  );

  if (isLoading || !serverState) return <SettingsSkeleton />;

  const Section = SECTION_BY_GROUP[group.id];

  const nav = (
    <SettingsNav
      activeId={activeId}
      onSelect={setActiveId}
      dirtyIds={dirtyIds}
      invalidIds={invalidIds}
      search={search}
      onSearchChange={setSearch}
    />
  );

  const preview = group.preview ? (
    <SettingsPreviewLazy
      values={values as never}
      page={previewPage}
      onPageChange={setPreviewPage}
      className="h-full"
    />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-surface bg-card p-8 text-center shadow-e1">
      <Eye className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">Nothing to preview</p>
      <p className="max-w-[24ch] text-xs text-muted-foreground">
        {group.label} changes route structure rather than what a page looks
        like.
      </p>
    </div>
  );

  return (
    <ManagerWrapper className="pb-4">
      <Form {...form}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveGroup();
          }}
          className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_24rem]"
        >
          <aside className="hidden lg:block">{nav}</aside>

          <div className="min-w-0">
            <GroupHeader
              title={group.label}
              description={group.description}
              dirty={isDirty}
              saving={isSaving}
              onRevert={revertGroup}
              mobileNav={nav}
              previewPane={group.preview ? preview : null}
            />

            <div className="mt-6">{Section && <Section form={form} />}</div>
          </div>

          <aside
            className={cn(
              "hidden xl:sticky xl:top-24 xl:flex xl:flex-col",
              anyDirty
                ? "xl:h-[calc(100vh-16rem)]"
                : "xl:h-[calc(100vh-11rem)]",
            )}
          >
            {preview}
          </aside>
        </form>
      </Form>

      {/*
        Reserve the bar's height rather than adding padding to the wrapper.
        `ManagerWrapper` sets `pb-20 md:pb-0`, and a `pb-28` passed in loses to
        `md:pb-0` at every width above `md` — tailwind-merge treats a variant as
        a separate group, so the class was silently doing nothing on desktop and
        the bar sat on top of the last field. A spacer cannot be overridden by
        whatever a parent decides about padding.
      */}
      {anyDirty && <div aria-hidden className="h-24" />}

      <AnimatePresence>
        {/*
          Any group, not the one on screen. Gating this on the active group
          meant navigating away from an edit hid the only control that would
          save it, so the edit could only be saved by finding your way back to
          where you made it.
        */}
        {anyDirty && (
          <motion.div
            initial={{ y: 72, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 72, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-50 bg-card/95 shadow-e3 backdrop-blur"
          >
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
              <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                Unsaved changes in{" "}
                <span className="font-medium text-foreground">
                  {dirtyGroups.map((entry) => entry.label).join(", ")}
                </span>
              </p>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={revertAll}
                  disabled={isSaving}
                >
                  <RotateCcw className="mr-1.5 size-3.5" />
                  {dirtyIds.size > 1 ? "Discard all" : "Revert"}
                </Button>

                {/*
                  Two save buttons only when they mean different things. With a
                  single dirty group "Save all" and "Save this" are the same
                  write, and offering both would be a choice with no content.
                */}
                {isDirty && dirtyIds.size > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void saveGroup()}
                    disabled={isSaving}
                  >
                    Save {group.label.toLowerCase()}
                  </Button>
                )}

                <Button
                  type="button"
                  size="sm"
                  onClick={() => void saveGroups(dirtyGroups)}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 size-3.5" />
                  )}
                  {dirtyIds.size > 1
                    ? `Save all (${dirtyIds.size})`
                    : `Save ${dirtyGroups[0]?.label.toLowerCase() ?? "changes"}`}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </ManagerWrapper>
  );
}

/**
 * The pane heading, plus the two controls that only exist below `xl`: the group
 * picker and the preview. Both are the same components the wide layout renders
 * in columns — a drawer is a different container, not a different feature.
 */
function GroupHeader({
  title,
  description,
  dirty,
  saving,
  onRevert,
  mobileNav,
  previewPane,
}: {
  title: string;
  description: string;
  dirty: boolean;
  saving: boolean;
  onRevert: () => void;
  mobileNav: JSX.Element;
  previewPane: JSX.Element | null;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="lg:hidden"
            >
              All settings
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Settings</SheetTitle>
            </SheetHeader>
            <div className="mt-4">{mobileNav}</div>
          </SheetContent>
        </Sheet>

        {previewPane && (
          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="xl:hidden"
              >
                <Eye className="mr-1.5 size-3.5" />
                Preview
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-full flex-col sm:max-w-xl"
            >
              <SheetHeader>
                <SheetTitle>Preview</SheetTitle>
              </SheetHeader>
              <div className="mt-4 min-h-0 flex-1">{previewPane}</div>
            </SheetContent>
          </Sheet>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRevert}
          disabled={!dirty || saving}
          className={cn(!dirty && "opacity-0")}
          aria-hidden={!dirty}
        >
          Revert
        </Button>
      </div>
    </div>
  );
}

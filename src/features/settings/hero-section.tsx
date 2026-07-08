"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { SITE_LIST_LIMITS } from "@/lib/schemas";
import {
  AddRowButton,
  FieldGroup,
  ListRow,
  useStringList,
  type SettingsForm,
} from "./settings-controls";

/**
 * Hero copy and the About bio.
 *
 * The bio used to be two `Textarea`s bound to `bio.0` and `bio.1`, with the
 * page padding the stored array to exactly two on load. So a site could have
 * one bio paragraph or two, and never three — a limit that existed nowhere in
 * the schema or the database, only in how many inputs happened to be drawn.
 * The ceiling now comes from `SITE_LIST_LIMITS`.
 */
export function HeroSection({ form }: { form: SettingsForm }) {
  const bio = useStringList(form, "profile_data.bio");

  return (
    <div className="space-y-6">
      <FormField
        control={form.control}
        name="profile_data.title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Role</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Software Engineer" />
            </FormControl>
            <FormDescription>
              Separate with <code className="font-mono">|</code> to rotate
              through several.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="profile_data.description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Hero description</FormLabel>
            <FormControl>
              <Textarea {...field} rows={3} />
            </FormControl>
            <FormDescription>Markdown. Shown under your name.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FieldGroup
        title="About bio"
        description="One paragraph per entry, rendered in order on /about."
      >
        <div className="space-y-3">
          {bio.items.map((_, index) => (
            <ListRow
              key={index}
              position={`paragraph ${index + 1}`}
              removeLabel={`Remove paragraph ${index + 1}`}
              onRemove={() => bio.remove(index)}
              onMoveUp={
                index > 0 ? () => bio.swap(index, index - 1) : undefined
              }
              onMoveDown={
                index < bio.items.length - 1
                  ? () => bio.swap(index, index + 1)
                  : undefined
              }
            >
              <FormField
                control={form.control}
                name={`profile_data.bio.${index}` as never}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={4}
                        aria-label={`Bio paragraph ${index + 1}`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </ListRow>
          ))}

          {bio.items.length === 0 && (
            <p className="rounded-surface bg-card p-4 text-sm text-muted-foreground shadow-e1">
              No bio yet. The About page will show your picture and nothing
              else.
            </p>
          )}

          <AddRowButton
            label="Add paragraph"
            onClick={bio.append}
            count={bio.items.length}
            max={SITE_LIST_LIMITS.BIO_PARAGRAPHS}
          />
        </div>
      </FieldGroup>
    </div>
  );
}

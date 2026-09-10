"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2, Send, TriangleAlert } from "lucide-react";
import {
  CONTACT_LIMITS,
  contactFormSchema,
  type ContactFormValues,
} from "@/lib/schemas";
import { useSubmitContactFormMutation } from "@/store/api/publicApi";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { getErrorMessage } from "@/lib/utils";

type Status = "idle" | "success" | "error";

/**
 * The database refuses a flood with a message worth reading — three per
 * address per hour, ten site-wide per minute. Showing "something broke" for
 * that tells a real person nothing about what to do next, so the server's own
 * wording is preferred when there is one.
 */
const GENERIC_ERROR = "Something broke. Try again or email me directly.";

const STATUS_RESET_MS = 5000;

/**
 * Fields sit on the card as quiet wells — the page ground inside the card —
 * and take the theme colour on focus rather than a thicker border.
 */
const FIELD =
  "rounded-control bg-background transition-[box-shadow,border-color] duration-200 ease-enter focus-visible:border-primary/60 aria-[invalid=true]:border-destructive/60";

export function ContactForm() {
  const [submitContactForm, { isLoading }] = useSubmitContactFormMutation();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState(GENERIC_ERROR);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { name: "", email: "", subject: "", message: "" },
  });

  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), STATUS_RESET_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const onSubmit = async (values: ContactFormValues) => {
    try {
      await submitContactForm(values).unwrap();
      setStatus("success");
      form.reset();
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || GENERIC_ERROR);
      setStatus("error");
    }
  };

  const errors = form.formState.errors;

  const field = (
    name: keyof ContactFormValues,
    label: string,
    props?: {
      textarea?: boolean;
      type?: string;
      placeholder?: string;
      /** Shows a live count once the field is most of the way to its ceiling. */
      max?: number;
    },
  ) => {
    const length = (form.watch(name) ?? "").length;
    // Only worth showing when it is about to matter. A counter on every field
    // from the first keystroke is noise on a form four fields long.
    const showCount = props?.max !== undefined && length > props.max * 0.8;

    return (
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor={`contact-${name}`}>{label}</Label>
          {showCount && (
            <span
              aria-live="polite"
              className={cn(
                "text-xs tabular-nums",
                length > props.max!
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {length.toLocaleString()} / {props.max!.toLocaleString()}
            </span>
          )}
        </div>
        {props?.textarea ? (
          <Textarea
            id={`contact-${name}`}
            rows={6}
            placeholder={props.placeholder}
            aria-invalid={!!errors[name]}
            className={cn(FIELD, "resize-y py-3")}
            {...form.register(name)}
          />
        ) : (
          <Input
            id={`contact-${name}`}
            type={props?.type ?? "text"}
            placeholder={props?.placeholder}
            aria-invalid={!!errors[name]}
            className={cn(FIELD, "h-11")}
            {...form.register(name)}
          />
        )}
        {errors[name] && (
          <p role="alert" className="text-xs text-destructive">
            {errors[name]?.message}
          </p>
        )}
      </div>
    );
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="space-y-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {field("name", "Name", {
          placeholder: "Ada Lovelace",
          max: CONTACT_LIMITS.NAME,
        })}
        {field("email", "Email", {
          type: "email",
          placeholder: "you@example.com",
          max: CONTACT_LIMITS.EMAIL,
        })}
      </div>
      {field("subject", "Subject", {
        placeholder: "Project, role, or question",
        max: CONTACT_LIMITS.SUBJECT,
      })}
      {field("message", "Message", {
        textarea: true,
        placeholder: "What are we building?",
        max: CONTACT_LIMITS.MESSAGE,
      })}

      <div className="flex flex-col gap-4 pt-1 sm:flex-row sm:items-center">
        <Button
          type="submit"
          size="lg"
          disabled={isLoading}
          className="w-full gap-2 rounded-full px-7 sm:w-auto sm:min-w-44"
        >
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Sending…
            </>
          ) : status === "success" ? (
            <>
              <Check className="size-4" aria-hidden />
              Sent
            </>
          ) : (
            <>
              <Send className="size-4" aria-hidden />
              Send message
            </>
          )}
        </Button>
        {/* One live region, always present, so a screen reader hears the
            outcome whichever it is. */}
        <div aria-live="polite" className="min-w-0 text-sm">
          {status === "success" && (
            <p className="flex items-center gap-2 rounded-control bg-primary/10 px-3 py-2 font-medium text-primary">
              <Check className="size-4 shrink-0" aria-hidden />
              Message received — I&apos;ll reply soon.
            </p>
          )}
          {status === "error" && (
            <p className="flex items-center gap-2 rounded-control bg-destructive/10 px-3 py-2 font-medium text-destructive">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              {errorMessage}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}

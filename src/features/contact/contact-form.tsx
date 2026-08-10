"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2, Send, TriangleAlert } from "lucide-react";
import { contactFormSchema, type ContactFormValues } from "@/lib/schemas";
import { useSubmitContactFormMutation } from "@/store/api/publicApi";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Status = "idle" | "success" | "error";

const STATUS_RESET_MS = 5000;

export function ContactForm() {
  const [submitContactForm, { isLoading }] = useSubmitContactFormMutation();
  const [status, setStatus] = useState<Status>("idle");

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
    } catch {
      setStatus("error");
    }
  };

  const errors = form.formState.errors;

  const field = (
    name: keyof ContactFormValues,
    label: string,
    props?: { textarea?: boolean; type?: string; placeholder?: string },
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`contact-${name}`}>{label}</Label>
      {props?.textarea ? (
        <Textarea
          id={`contact-${name}`}
          rows={5}
          placeholder={props.placeholder}
          aria-invalid={!!errors[name]}
          {...form.register(name)}
        />
      ) : (
        <Input
          id={`contact-${name}`}
          type={props?.type ?? "text"}
          placeholder={props?.placeholder}
          aria-invalid={!!errors[name]}
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

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="space-y-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {field("name", "Name", { placeholder: "Ada Lovelace" })}
        {field("email", "Email", {
          type: "email",
          placeholder: "you@example.com",
        })}
      </div>
      {field("subject", "Subject", {
        placeholder: "Project, role, or question",
      })}
      {field("message", "Message", {
        textarea: true,
        placeholder: "What are we building?",
      })}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={isLoading} className="min-w-36">
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
        <p aria-live="polite" className="font-mono text-xs">
          {status === "success" && (
            <span className="text-primary">
              Message received — I&apos;ll reply soon.
            </span>
          )}
          {status === "error" && (
            <span className="flex items-center gap-1.5 text-destructive">
              <TriangleAlert className="size-3.5" aria-hidden />
              Something broke. Try again or email me directly.
            </span>
          )}
        </p>
      </div>
    </form>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  FileText,
  Globe,
  GraduationCap,
  Hourglass,
  Layers,
  Link as LinkIcon,
  Plus,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import type { LearningStatus, LearningTopic } from "@/types";
import { useSaveTopicMutation } from "@/store/api/adminApi";
import NovelEditor from "@/components/admin/novel-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn, formatDate, getErrorMessage } from "@/lib/utils";
import { urlOrEmpty } from "@/lib/schemas";
import { SessionTracker } from "./session-tracker";

/* ── Status pipeline ── */
const STATUS_STEPS: { value: LearningStatus; label: string }[] = [
  { value: "To Learn", label: "Queue" },
  { value: "Learning", label: "Learning" },
  { value: "Practicing", label: "Practicing" },
  { value: "Mastered", label: "Mastered" },
];

const StatusPipeline = ({
  current,
  onChange,
}: {
  current: LearningStatus;
  onChange: (s: LearningStatus) => void;
}) => (
  <div className="flex items-center rounded-surface border border-border/50 bg-secondary/40 p-1">
    {STATUS_STEPS.map((step) => (
      <button
        key={step.value}
        onClick={() => onChange(step.value)}
        className={cn(
          "relative rounded-md px-3 py-1 text-[10px] font-semibold transition-all duration-200 sm:text-xs",
          current === step.value
            ? "bg-background text-foreground shadow-e1 ring-1 ring-border/50"
            : "text-muted-foreground hover:bg-background/40 hover:text-foreground/80",
        )}
      >
        {step.label}
      </button>
    ))}
  </div>
);

/* ── Resources ── */
const parseResource = (rawText: string | undefined | null) => {
  if (!rawText) return { type: "Link", title: "Untitled Resource" };
  const types = [
    "Article",
    "Video",
    "Course",
    "Official",
    "Roadmap",
    "OpenSource",
  ];
  for (const type of types) {
    if (rawText.startsWith(type))
      return { type, title: rawText.substring(type.length).trim() };
  }
  return { type: "Link", title: rawText };
};

const getResourceIcon = (type: string) => {
  switch (type) {
    case "Video":
      return <Video className="size-3.5 text-chart-5" />;
    case "Article":
      return <FileText className="size-3.5 text-chart-1" />;
    case "Course":
      return <GraduationCap className="size-3.5 text-chart-2" />;
    case "Official":
      return <Globe className="size-3.5 text-chart-3" />;
    case "OpenSource":
      return <Globe className="size-3.5 text-chart-4" />;
    default:
      return <LinkIcon className="size-3.5 text-muted-foreground" />;
  }
};

const ResourceCard = ({
  resource,
  onDelete,
}: {
  resource: { name: string; url: string };
  onDelete: () => void;
}) => {
  const { type, title } = parseResource(resource.name);
  return (
    <div className="group relative flex items-start gap-3 rounded-surface bg-card shadow-e1 p-3 transition-shadow duration-200 ease-enter hover:bg-card hover:shadow-e1">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control bg-secondary">
        {getResourceIcon(type)}
      </div>
      <div className="min-w-0 flex-1 pr-6">
        <div className="mb-0.5 flex items-center gap-2">
          <Badge
            variant="secondary"
            className="h-4 rounded-[4px] px-1 font-mono text-[9px] font-normal uppercase tracking-wider text-muted-foreground/80"
          >
            {type}
          </Badge>
        </div>
        <a
          href={resource.url}
          target="_blank"
          rel="noreferrer"
          className="block text-xs font-medium leading-snug hover:text-primary hover:underline sm:text-sm"
        >
          {title || resource.name}
        </a>
      </div>
      <button
        onClick={(e) => {
          e.preventDefault();
          onDelete();
        }}
        className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground/30 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
};

const ResourceList = ({
  resources,
  onAdd,
  onDelete,
}: {
  resources: { name: string; url: string }[];
  onAdd: () => void;
  onDelete: (index: number) => void;
}) => (
  <>
    <div className="mb-4 flex items-center justify-between">
      <div className="t-micro flex items-center gap-2">
        <Layers className="size-3.5" /> Resources{" "}
        <Badge
          variant="secondary"
          className="h-4 min-w-[20px] justify-center px-1 text-[9px]"
        >
          {resources.length}
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 hover:bg-primary/10 hover:text-primary"
        onClick={onAdd}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {resources.map((res, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, height: 0 }}
          >
            <ResourceCard resource={res} onDelete={() => onDelete(i)} />
          </motion.div>
        ))}
      </AnimatePresence>
      {resources.length === 0 && (
        <div
          onClick={onAdd}
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-6 text-center transition-all hover:bg-muted/30"
        >
          <p className="text-xs font-medium text-foreground">Empty Library</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Add links, videos, or docs.
          </p>
        </div>
      )}
    </div>
  </>
);

/* ── Main component ── */

interface TopicEditorProps {
  topic: LearningTopic | null;
  onBack: () => void;
  onTopicUpdate: (updatedTopic: LearningTopic) => void;
}

export function TopicEditor({
  topic,
  onBack,
  onTopicUpdate,
}: TopicEditorProps) {
  const isMobile = useIsMobile();
  const [coreNotes, setCoreNotes] = useState("");
  const [status, setStatus] = useState<LearningStatus>("To Learn");
  const [resources, setResources] = useState<{ name: string; url: string }[]>(
    [],
  );
  const [isAddResourceOpen, setIsAddResourceOpen] = useState(false);
  const [newResName, setNewResName] = useState("");
  const [newResUrl, setNewResUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  const [saveTopic, { isLoading: isSaving }] = useSaveTopicMutation();

  useEffect(() => {
    if (topic) {
      setCoreNotes(topic.core_notes || "");
      setStatus(topic.status || "To Learn");
      const rawResources = topic.resources || [];
      setResources(
        rawResources.map((res) => ({
          name: res.name || "Untitled",
          url: res.url || "",
        })),
      );
    }
  }, [topic]);

  const handleSave = useCallback(
    async (updateData: Partial<LearningTopic>, isAutosave = false) => {
      if (!topic) return;
      try {
        const updatedTopic = await saveTopic({
          id: topic.id,
          ...updateData,
        }).unwrap();
        if (!isAutosave) toast.success("Topic saved");
        onTopicUpdate(updatedTopic);
      } catch (err) {
        toast.error("Failed to save", { description: getErrorMessage(err) });
      }
    },
    [topic, saveTopic, onTopicUpdate],
  );

  // Debounced autosave for the notes editor
  useEffect(() => {
    if (!topic || coreNotes === (topic.core_notes || "")) return;
    const handler = setTimeout(
      () => handleSave({ core_notes: coreNotes }, true),
      2000,
    );
    return () => clearTimeout(handler);
  }, [coreNotes, topic, handleSave]);

  const handleStatusChange = (newStatus: LearningStatus) => {
    setStatus(newStatus);
    handleSave({ status: newStatus });
  };

  const validateUrl = (url: string): boolean => {
    const result = urlOrEmpty.safeParse(url);
    if (!result.success) {
      setUrlError("Please enter a valid URL");
      return false;
    }
    setUrlError(null);
    return true;
  };

  const handleAddResource = () => {
    if (!newResName || !newResUrl || !validateUrl(newResUrl)) return;
    const updatedResources = [
      ...resources,
      { name: newResName, url: newResUrl },
    ];
    setResources(updatedResources);
    handleSave({ resources: updatedResources, core_notes: coreNotes });
    setNewResName("");
    setNewResUrl("");
    setIsAddResourceOpen(false);
  };

  const handleDeleteResource = (index: number) => {
    const updatedResources = resources.filter((_, i) => i !== index);
    setResources(updatedResources);
    handleSave({ resources: updatedResources, core_notes: coreNotes });
  };

  if (!topic) return null;

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden bg-background",
        !isMobile && "rounded-xl border shadow-e3",
      )}
    >
      {/* Fixed header */}
      <header
        className={cn(
          "z-20 flex shrink-0 flex-col justify-between gap-4 border-b bg-background/80 px-4 py-3 backdrop-blur-md md:flex-row md:items-center",
          !isMobile && "rounded-t-xl",
        )}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to modules"
            onClick={onBack}
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-heading text-lg font-bold tracking-tight">
                {topic.title}
              </h1>
              {isSaving && (
                <span className="animate-pulse font-mono text-[10px] text-primary">
                  SAVING...
                </span>
              )}
            </div>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
              EDITED: {formatDate(new Date(topic.updated_at || new Date()))}
            </p>
          </div>
        </div>
        <StatusPipeline current={status} onChange={handleStatusChange} />
      </header>

      {/* Scrollable content: desktop side-by-side, mobile stacked */}
      <div className="flex-1 overflow-hidden">
        <div className={cn("h-full", !isMobile && "flex gap-0")}>
          {/* Left column: editor */}
          <div
            className={cn(
              "overflow-y-auto",
              isMobile ? "h-auto" : "min-w-0 flex-1",
            )}
          >
            {/* Mobile-only: timer above editor */}
            {isMobile && (
              <div className="px-4 pb-2 pt-6">
                <div className="mb-6 rounded-surface bg-card p-4 shadow-e1">
                  <div className="t-micro mb-3 flex items-center gap-2">
                    <Hourglass className="size-3.5" /> Study Session
                  </div>
                  <SessionTracker topic={topic} />
                </div>
              </div>
            )}

            <div className="flex-1 px-4 pb-12 pt-4">
              <NovelEditor
                value={coreNotes}
                onChange={setCoreNotes}
                placeholder="Start taking notes..."
                minHeight="500px"
                isRounded={true}
                className="border-none bg-transparent px-0 shadow-none"
              />
            </div>

            {/* Mobile-only: resources below editor */}
            {isMobile && (
              <div className="border-t bg-muted/5 px-6 pb-20 pt-4">
                <ResourceList
                  resources={resources}
                  onAdd={() => setIsAddResourceOpen(true)}
                  onDelete={handleDeleteResource}
                />
              </div>
            )}
          </div>

          {/* Right column: timer + resources sidebar (desktop only) */}
          {!isMobile && (
            <div className="w-80 shrink-0 overflow-y-auto border-l bg-muted/5 xl:w-96">
              <div className="p-4">
                <div className="rounded-surface bg-card p-4 shadow-e1">
                  <div className="t-micro mb-3 flex items-center gap-2">
                    <Hourglass className="size-3.5" /> Study Session
                  </div>
                  <SessionTracker topic={topic} />
                </div>
              </div>

              <Separator className="mx-4 w-auto" />

              <div className="p-4 pb-20">
                <ResourceList
                  resources={resources}
                  onAdd={() => setIsAddResourceOpen(true)}
                  onDelete={handleDeleteResource}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={isAddResourceOpen}
        onOpenChange={(open) => {
          setIsAddResourceOpen(open);
          if (!open) {
            setUrlError(null);
            setNewResName("");
            setNewResUrl("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Resource</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="e.g. React Docs"
                value={newResName}
                onChange={(e) => setNewResName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input
                placeholder="https://..."
                value={newResUrl}
                onChange={(e) => {
                  setNewResUrl(e.target.value);
                  if (urlError) setUrlError(null);
                }}
                className={urlError ? "border-destructive" : ""}
              />
              {urlError && (
                <p className="text-xs text-destructive">{urlError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAddResourceOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddResource}
              disabled={!newResName || !newResUrl}
            >
              Add Resource
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

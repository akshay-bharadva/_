"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Clock,
  Layers,
  Loader2,
  Plus,
  X,
  Zap,
} from "lucide-react";
import {
  eachDayOfInterval,
  format,
  startOfDay,
  startOfWeek,
  subDays,
} from "date-fns";
import { toast } from "sonner";
import type { LearningSubject, LearningTopic } from "@/types";
import {
  useDeleteSubjectMutation,
  useDeleteTopicMutation,
  useGetLearningDataQuery,
} from "@/store/api/adminApi";
import { useAppSelector } from "@/store/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ManagerWrapper,
  PageHeader,
  StatCard,
} from "@/components/admin/shared";
import { cn, getErrorMessage } from "@/lib/utils";
import { ModuleCard } from "./module-card";
import { TopicEditor } from "./topic-editor";
import { SubjectForm } from "./subject-form";
import { TopicForm } from "./topic-form";

type SheetState =
  | { type: "create-subject" }
  | { type: "edit-subject"; data: LearningSubject }
  | { type: "create-topic"; subjectId: string }
  | { type: "edit-topic"; data: LearningTopic }
  | null;

const Heatmap = ({
  data,
  days,
}: {
  data: Record<string, number>;
  days: Date[];
}) => {
  const getColor = (m: number) => {
    if (m <= 0) return "bg-muted/50";
    if (m < 30) return "bg-primary/20";
    if (m < 60) return "bg-primary/50";
    return "bg-primary";
  };
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-1">
      {days.map((day) => {
        const dateKey = format(day, "yyyy-MM-dd");
        const minutes = data[dateKey] || 0;
        return (
          <TooltipProvider key={dateKey} delayDuration={100}>
            <Tooltip>
              <TooltipTrigger>
                <div
                  className={cn(
                    "h-3 w-3 rounded-[3px] transition-colors sm:h-4 sm:w-4",
                    getColor(minutes),
                  )}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-sm font-bold">{minutes} mins</p>
                <p className="text-xs text-muted-foreground">
                  {format(day, "MMM do, yyyy")}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
};

export default function LearningPage() {
  const confirm = useConfirm();
  const isMobile = useIsMobile();
  const [sheetState, setSheetState] = useState<SheetState>(null);
  const [isHeatmapOpen, setIsHeatmapOpen] = useState(!isMobile);
  const [selectedTopic, setSelectedTopic] = useState<LearningTopic | null>(
    null,
  );

  const { data, isLoading } = useGetLearningDataQuery();
  const { activeSession } = useAppSelector((state) => state.learningSession);
  const [deleteSubject] = useDeleteSubjectMutation();
  const [deleteTopic] = useDeleteTopicMutation();

  const subjects = data?.subjects || [];
  const topics = data?.topics || [];
  const sessions = data?.sessions || [];

  const stats = useMemo(() => {
    const totalMinutes = sessions.reduce(
      (acc, s) => acc + (s.duration_minutes || 0),
      0,
    );
    return { totalHours: (totalMinutes / 60).toFixed(1) };
  }, [sessions]);

  const { heatmapData, gridDays } = useMemo(() => {
    const today = new Date();
    const start = startOfWeek(subDays(today, 364));
    const days = eachDayOfInterval({ start, end: today });
    const data = sessions.reduce((acc: Record<string, number>, s) => {
      if (!s.duration_minutes) return acc;
      const key = format(startOfDay(new Date(s.start_time)), "yyyy-MM-dd");
      acc[key] = (acc[key] || 0) + s.duration_minutes;
      return acc;
    }, {});
    return { heatmapData: data, gridDays: days };
  }, [sessions]);

  const handleSaveSuccess = () => setSheetState(null);

  const handleDelete = async (type: "subject" | "topic", id: string) => {
    const ok = await confirm({
      title: `Delete ${type === "subject" ? "Module" : "Topic"}?`,
      description: `This cannot be undone.`,
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const mutation = type === "subject" ? deleteSubject : deleteTopic;
      await mutation(id).unwrap();
      toast.success(`${type === "subject" ? "Module" : "Topic"} deleted`);
      if (type === "topic" && selectedTopic?.id === id) {
        setSelectedTopic(null);
      }
    } catch (err) {
      toast.error("Delete failed", { description: getErrorMessage(err) });
    }
  };

  if (isLoading) {
    return (
      <ManagerWrapper>
        <div className="flex h-[80vh] items-center justify-center">
          <Loader2 className="size-10 animate-spin text-muted-foreground/30" />
        </div>
      </ManagerWrapper>
    );
  }

  // Full-screen editor mode replaces the dashboard while a topic is open,
  // maximizing space for note-taking.
  if (selectedTopic) {
    return (
      <ManagerWrapper className="h-[calc(100vh-4rem)] p-0 md:p-6">
        <TopicEditor
          topic={selectedTopic}
          onBack={() => setSelectedTopic(null)}
          onTopicUpdate={(updated) => {
            if (selectedTopic?.id === updated.id) setSelectedTopic(updated);
          }}
        />
      </ManagerWrapper>
    );
  }

  return (
    <ManagerWrapper>
      <PageHeader
        title="Learning"
        description="Track your personal curriculum and knowledge base"
        actions={
          <Button onClick={() => setSheetState({ type: "create-subject" })}>
            <Plus className="mr-2 size-4" /> New Module
          </Button>
        }
      />

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            title="Study Time"
            value={`${stats.totalHours} hrs`}
            icon={Clock}
            highlight
          />
          <StatCard title="Modules" value={subjects.length} icon={Layers} />
          <StatCard title="Topics" value={topics.length} icon={BookOpen} />
          <StatCard title="Sessions" value={sessions.length} icon={Zap} />
        </div>

        <Collapsible open={isHeatmapOpen} onOpenChange={setIsHeatmapOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer py-3 transition-colors hover:bg-muted/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Consistency Log</CardTitle>
                  <ChevronDown
                    className={cn(
                      "size-5 text-muted-foreground transition-transform",
                      isHeatmapOpen && "rotate-180",
                    )}
                  />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="overflow-x-auto pb-4 pt-0">
                <div className="min-w-[600px] md:min-w-full">
                  <Heatmap data={heatmapData} days={gridDays} />
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <div className="space-y-4">
          <h3 className="font-heading text-lg font-semibold">Modules</h3>
          {subjects.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Layers className="mx-auto mb-4 size-12 text-muted-foreground/30" />
                <p className="mb-1 text-lg font-semibold">No modules yet</p>
                <Button
                  onClick={() => setSheetState({ type: "create-subject" })}
                >
                  <Plus className="mr-2 size-4" /> Create First Module
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {subjects.map((subject) => (
                <ModuleCard
                  key={subject.id}
                  subject={subject}
                  topics={topics.filter((t) => t.subject_id === subject.id)}
                  activeSession={activeSession}
                  onTopicClick={(topic) => setSelectedTopic(topic)}
                  onEditSubject={() =>
                    setSheetState({ type: "edit-subject", data: subject })
                  }
                  onDeleteSubject={() => handleDelete("subject", subject.id)}
                  onAddTopic={() =>
                    setSheetState({ type: "create-topic", subjectId: subject.id })
                  }
                  onEditTopic={(topic) =>
                    setSheetState({ type: "edit-topic", data: topic })
                  }
                  onDeleteTopic={(id) => handleDelete("topic", id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Sheet
        open={!!sheetState}
        onOpenChange={(open) => !open && setSheetState(null)}
      >
        <SheetContent className="sm:max-w-lg">
          <div className="mb-6 flex items-center justify-between">
            <SheetHeader>
              <SheetTitle>
                {sheetState?.type?.includes("create") ? "Create" : "Edit"}{" "}
                {sheetState?.type?.includes("subject") ? "Module" : "Topic"}
              </SheetTitle>
              <SheetDescription>Configure details.</SheetDescription>
            </SheetHeader>
            <SheetClose asChild>
              <Button variant="ghost" size="icon">
                <X className="size-4" />
              </Button>
            </SheetClose>
          </div>
          {(sheetState?.type === "create-subject" ||
            sheetState?.type === "edit-subject") && (
            <SubjectForm
              subject={sheetState.type === "edit-subject" ? sheetState.data : null}
              onSuccess={handleSaveSuccess}
            />
          )}
          {(sheetState?.type === "create-topic" ||
            sheetState?.type === "edit-topic") && (
            <TopicForm
              topic={sheetState.type === "edit-topic" ? sheetState.data : null}
              subjects={subjects}
              defaultSubjectId={
                sheetState.type === "create-topic"
                  ? sheetState.subjectId
                  : undefined
              }
              onSuccess={handleSaveSuccess}
            />
          )}
        </SheetContent>
      </Sheet>
    </ManagerWrapper>
  );
}

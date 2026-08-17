"use client";

import { useMemo, useState } from "react";
import { BookOpen, Layers, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { LearningSubject, LearningTopic } from "@/types";
import {
  useDeleteSubjectMutation,
  useDeleteTopicMutation,
  useGetLearningDataQuery,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import {
  EmptyState,
  FormSheet,
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import { ModuleCard } from "./module-card";
import { TopicEditor } from "./topic-editor";
import { SubjectForm } from "./subject-form";
import { TopicForm } from "./topic-form";
import { ReviewSession } from "./review-session";
import { StudyToday } from "./study-today";
import { buildQueue, todayIso } from "./spaced-review";

type SheetState =
  | { type: "create-subject" }
  | { type: "edit-subject"; data: LearningSubject }
  | { type: "create-topic"; subjectId?: string }
  | { type: "edit-topic"; data: LearningTopic }
  | null;

export default function LearningPage() {
  const confirm = useConfirm();
  const [sheetState, setSheetState] = useState<SheetState>(null);
  const [selectedTopic, setSelectedTopic] = useState<LearningTopic | null>(
    null,
  );
  const [isReviewing, setIsReviewing] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  const { data, isLoading } = useGetLearningDataQuery();
  const [deleteSubject] = useDeleteSubjectMutation();
  const [deleteTopic] = useDeleteTopicMutation();

  const subjects = useMemo(() => data?.subjects ?? [], [data]);
  const topics = useMemo(() => data?.topics ?? [], [data]);
  const sessions = useMemo(() => data?.sessions ?? [], [data]);
  const reviews = useMemo(() => data?.reviews ?? [], [data]);

  const today = todayIso();
  const queue = useMemo(() => buildQueue(topics, { today }), [topics, today]);

  // Due first, then new: finishing what you started beats starting more.
  const sessionQueue = useMemo(() => [...queue.due, ...queue.fresh], [queue]);

  const handleDelete = async (kind: "subject" | "topic", id: string) => {
    const isSubject = kind === "subject";
    const affected = isSubject
      ? topics.filter((t) => t.subject_id === id).length
      : 0;

    const ok = await confirm({
      title: isSubject ? "Delete this module?" : "Delete this topic?",
      description: isSubject
        ? `${affected > 0 ? `Its ${affected} topic${affected === 1 ? "" : "s"}, their notes and review history go with it. ` : ""}This cannot be undone.`
        : "Its notes and review history go with it. Archiving keeps them instead.",
      variant: "destructive",
      confirmText: "Delete",
    });
    if (!ok) return;

    try {
      if (isSubject) await deleteSubject(id).unwrap();
      else await deleteTopic(id).unwrap();
      toast.success("Deleted.");
    } catch (err) {
      toast.error("Couldn't delete that", {
        description: getErrorMessage(err),
      });
    }
  };

  if (isLoading) {
    return (
      <ManagerWrapper>
        <LoadingState label="Loading" />
      </ManagerWrapper>
    );
  }

  // The notes editor takes the whole screen: writing is the one thing here
  // that benefits from room.
  if (selectedTopic) {
    return (
      <ManagerWrapper className="p-0 md:p-6">
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

  if (isReviewing) {
    return (
      <ManagerWrapper>
        <ReviewSession
          queue={sessionQueue}
          onExit={() => setIsReviewing(false)}
          onEditTopic={(topic) => {
            setIsReviewing(false);
            setSelectedTopic(topic);
          }}
        />
      </ManagerWrapper>
    );
  }

  return (
    <ManagerWrapper>
      <PageHeader
        title="Learning"
        description="What's worth going over today."
        actions={
          <Button
            variant="outline"
            onClick={() => setShowLibrary((v) => !v)}
            className="w-full sm:w-auto"
          >
            <Layers className="mr-2 size-4" aria-hidden />
            {showLibrary ? "Hide library" : "Library"}
          </Button>
        }
      />

      {topics.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          variant="card"
          title="Start with one topic"
          description="Not a syllabus — one thing you want to remember. Add notes when you have them; the schedule brings it back before you forget it."
          action={{
            label: "Add a topic",
            onClick: () => setSheetState({ type: "create-topic" }),
            icon: Plus,
          }}
        />
      ) : (
        <StudyToday
          queue={queue}
          topics={topics}
          subjects={subjects}
          sessions={sessions}
          reviews={reviews}
          today={today}
          onStart={() => setIsReviewing(true)}
          onAddTopic={() => setSheetState({ type: "create-topic" })}
        />
      )}

      {showLibrary && (
        <section className="mt-8 space-y-4 border-t pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium">Library</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSheetState({ type: "create-topic" })}
              >
                <Plus className="mr-2 size-4" aria-hidden /> Topic
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSheetState({ type: "create-subject" })}
              >
                <Plus className="mr-2 size-4" aria-hidden /> Module
              </Button>
            </div>
          </div>

          {subjects.length === 0 && topics.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              variant="bordered"
              title="Nothing filed yet"
              description="Modules are optional — a topic works fine on its own."
            />
          ) : (
            <div className="space-y-3">
              {subjects.map((subject) => (
                <ModuleCard
                  key={subject.id}
                  subject={subject}
                  topics={topics.filter((t) => t.subject_id === subject.id)}
                  today={today}
                  onTopicClick={setSelectedTopic}
                  onEditSubject={() =>
                    setSheetState({ type: "edit-subject", data: subject })
                  }
                  onDeleteSubject={() => handleDelete("subject", subject.id)}
                  onAddTopic={() =>
                    setSheetState({
                      type: "create-topic",
                      subjectId: subject.id,
                    })
                  }
                  onEditTopic={(topic) =>
                    setSheetState({ type: "edit-topic", data: topic })
                  }
                  onDeleteTopic={(id) => handleDelete("topic", id)}
                />
              ))}

              {/* A topic does not need a module. Hiding the unfiled ones is
                  what made the library feel like it demanded a curriculum. */}
              {topics.some((t) => !t.subject_id) && (
                <ModuleCard
                  subject={null}
                  topics={topics.filter((t) => !t.subject_id)}
                  today={today}
                  onTopicClick={setSelectedTopic}
                  onAddTopic={() => setSheetState({ type: "create-topic" })}
                  onEditTopic={(topic) =>
                    setSheetState({ type: "edit-topic", data: topic })
                  }
                  onDeleteTopic={(id) => handleDelete("topic", id)}
                />
              )}
            </div>
          )}
        </section>
      )}

      <FormSheet
        open={!!sheetState}
        onOpenChange={(open) => !open && setSheetState(null)}
        title={
          sheetState?.type === "create-topic"
            ? "New topic"
            : sheetState?.type === "edit-topic"
              ? "Edit topic"
              : sheetState?.type === "create-subject"
                ? "New module"
                : "Edit module"
        }
        description={
          sheetState?.type?.includes("topic")
            ? "A thing you want to remember. Notes can come later."
            : "A grouping for related topics."
        }
      >
        {(sheetState?.type === "create-subject" ||
          sheetState?.type === "edit-subject") && (
          <SubjectForm
            subject={
              sheetState.type === "edit-subject" ? sheetState.data : null
            }
            onSuccess={() => setSheetState(null)}
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
            onSuccess={() => setSheetState(null)}
          />
        )}
      </FormSheet>
    </ManagerWrapper>
  );
}

import { describe, it, expect } from "vitest";
import type { Task, TaskProject } from "@/types";
import { indexDependencies, indexTasks } from "./task-dependencies";
import {
  DEFAULT_FILTERS,
  collectTags,
  filterTasks,
  groupTasks,
  isDueToday,
  isOverdue,
  sortTasks,
  todayIso,
  type TaskFilters,
} from "./task-filters";

const TODAY = "2026-06-15";

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Task",
  status: "todo",
  priority: "medium",
  ...overrides,
});

const withFilters = (overrides: Partial<TaskFilters> = {}): TaskFilters => ({
  ...DEFAULT_FILTERS,
  ...overrides,
});

const noDeps = indexDependencies([]);

const run = (
  tasks: Task[],
  overrides: Partial<TaskFilters> = {},
  deps = noDeps,
) => filterTasks(tasks, withFilters(overrides), deps, indexTasks(tasks), TODAY);

describe("todayIso", () => {
  it("formats the local calendar day", () => {
    expect(todayIso(new Date(2026, 5, 5))).toBe("2026-06-05");
  });

  /**
   * `due_date` is a DATE with no time or zone. Building it from a UTC
   * timestamp reads as the previous day for anyone west of Greenwich, which
   * would mark today's tasks overdue.
   */
  it("uses local date parts, not UTC", () => {
    const lateEvening = new Date(2026, 5, 15, 23, 30);
    expect(todayIso(lateEvening)).toBe("2026-06-15");
  });
});

describe("isOverdue", () => {
  it("flags a past due date", () => {
    expect(isOverdue(task({ due_date: "2026-06-14" }), TODAY)).toBe(true);
  });

  it("does not flag today", () => {
    expect(isOverdue(task({ due_date: TODAY }), TODAY)).toBe(false);
  });

  it("does not flag a completed task", () => {
    expect(
      isOverdue(task({ due_date: "2026-01-01", status: "done" }), TODAY),
    ).toBe(false);
  });

  it("does not flag a task with no due date", () => {
    expect(isOverdue(task(), TODAY)).toBe(false);
  });
});

describe("isDueToday", () => {
  it("flags today's outstanding work", () => {
    expect(isDueToday(task({ due_date: TODAY }), TODAY)).toBe(true);
  });

  it("ignores work already finished", () => {
    expect(isDueToday(task({ due_date: TODAY, status: "done" }), TODAY)).toBe(
      false,
    );
  });
});

describe("filterTasks", () => {
  it("returns everything by default", () => {
    expect(run([task({ id: "a" }), task({ id: "b" })])).toHaveLength(2);
  });

  it("hides completed tasks when asked", () => {
    const tasks = [task({ id: "a" }), task({ id: "b", status: "done" })];
    expect(run(tasks, { showDone: false }).map((t) => t.id)).toEqual(["a"]);
  });

  it("filters by status, priority and tag", () => {
    const tasks = [
      task({ id: "a", status: "review" }),
      task({ id: "b", priority: "high" }),
      task({ id: "c", tags: ["home"] }),
    ];
    expect(run(tasks, { status: "review" }).map((t) => t.id)).toEqual(["a"]);
    expect(run(tasks, { priority: "high" }).map((t) => t.id)).toEqual(["b"]);
    expect(run(tasks, { tag: "home" }).map((t) => t.id)).toEqual(["c"]);
  });

  it("separates a chosen project from tasks with no project", () => {
    const tasks = [
      task({ id: "a", project_id: "p1" }),
      task({ id: "b", project_id: null }),
    ];
    expect(run(tasks, { projectId: "p1" }).map((t) => t.id)).toEqual(["a"]);
    expect(run(tasks, { projectId: "none" }).map((t) => t.id)).toEqual(["b"]);
  });

  it("searches title, description and tags", () => {
    const tasks = [
      task({ id: "a", title: "Renew passport" }),
      task({ id: "b", description: "passport photos" }),
      task({ id: "c", tags: ["passport"] }),
      task({ id: "d", title: "Unrelated" }),
    ];
    expect(run(tasks, { search: "passport" }).map((t) => t.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("searches case-insensitively", () => {
    expect(
      run([task({ title: "Renew Passport" })], { search: "PASSPORT" }),
    ).toHaveLength(1);
  });

  it("filters to blocked tasks only", () => {
    const tasks = [task({ id: "a" }), task({ id: "b" })];
    const deps = indexDependencies([
      { id: "d1", task_id: "b", depends_on_id: "a" },
    ]);
    expect(run(tasks, { blockedOnly: true }, deps).map((t) => t.id)).toEqual([
      "b",
    ]);
  });

  it("stops showing a task as blocked once its blocker is done", () => {
    const tasks = [task({ id: "a", status: "done" }), task({ id: "b" })];
    const deps = indexDependencies([
      { id: "d1", task_id: "b", depends_on_id: "a" },
    ]);
    expect(run(tasks, { blockedOnly: true }, deps)).toEqual([]);
  });

  it("filters to overdue tasks only", () => {
    const tasks = [
      task({ id: "a", due_date: "2026-06-01" }),
      task({ id: "b", due_date: "2026-12-01" }),
    ];
    expect(run(tasks, { overdueOnly: true }).map((t) => t.id)).toEqual(["a"]);
  });

  it("combines filters", () => {
    const tasks = [
      task({ id: "a", priority: "high", due_date: "2026-06-01" }),
      task({ id: "b", priority: "low", due_date: "2026-06-01" }),
    ];
    expect(
      run(tasks, { priority: "high", overdueOnly: true }).map((t) => t.id),
    ).toEqual(["a"]);
  });
});

describe("sortTasks", () => {
  it("sorts by manual rank", () => {
    const tasks = [
      task({ id: "a", display_order: 2 }),
      task({ id: "b", display_order: 1 }),
    ];
    expect(sortTasks(tasks, "manual").map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("sorts by due date, earliest first", () => {
    const tasks = [
      task({ id: "a", due_date: "2026-07-01" }),
      task({ id: "b", due_date: "2026-06-01" }),
    ];
    expect(sortTasks(tasks, "due").map((t) => t.id)).toEqual(["b", "a"]);
  });

  /** An absent due date means "whenever", not "immediately". */
  it("puts undated tasks last when sorting by due date", () => {
    const tasks = [
      task({ id: "a" }),
      task({ id: "b", due_date: "2026-06-01" }),
    ];
    expect(sortTasks(tasks, "due").map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("sorts high priority first", () => {
    const tasks = [
      task({ id: "a", priority: "low" }),
      task({ id: "b", priority: "high" }),
      task({ id: "c", priority: "medium" }),
    ];
    expect(sortTasks(tasks, "priority").map((t) => t.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("sorts by title without being case sensitive", () => {
    const tasks = [
      task({ id: "a", title: "banana" }),
      task({ id: "b", title: "Apple" }),
    ];
    expect(sortTasks(tasks, "title").map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("does not mutate the input", () => {
    const tasks = [
      task({ id: "a", display_order: 2 }),
      task({ id: "b", display_order: 1 }),
    ];
    sortTasks(tasks, "manual");
    expect(tasks.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("groupTasks", () => {
  const projects: TaskProject[] = [{ id: "p1", name: "Home" }];
  const label = (s: string) => s;

  /** The board renders a column per status, so an empty one still has to exist. */
  it("keeps empty status groups", () => {
    const groups = groupTasks([task({ status: "todo" })], "status", [], label);
    expect(groups).toHaveLength(4);
    expect(groups.find((g) => g.key === "done")?.tasks).toEqual([]);
  });

  it("drops empty priority groups", () => {
    const groups = groupTasks(
      [task({ priority: "high" })],
      "priority",
      [],
      label,
    );
    expect(groups.map((g) => g.key)).toEqual(["high"]);
  });

  it("groups by project and collects the unassigned", () => {
    const tasks = [
      task({ id: "a", project_id: "p1" }),
      task({ id: "b", project_id: null }),
    ];
    const groups = groupTasks(tasks, "project", projects, label);
    expect(groups.map((g) => g.label)).toEqual(["Home", "No project"]);
  });

  it("buckets by due date in order of urgency", () => {
    const tasks = [
      task({ id: "later", due_date: "2026-12-01" }),
      task({ id: "none" }),
      task({ id: "late", due_date: "2026-01-01" }),
      task({ id: "now", due_date: TODAY }),
    ];
    const groups = groupTasks(tasks, "due", [], label, TODAY);
    expect(groups.map((g) => g.key)).toEqual([
      "overdue",
      "today",
      "upcoming",
      "none",
    ]);
    expect(groups[0].tasks[0].id).toBe("late");
  });

  it("returns nothing for no tasks when grouping by project", () => {
    expect(groupTasks([], "project", projects, label)).toEqual([]);
  });
});

describe("collectTags", () => {
  it("returns every tag in use, sorted and deduplicated", () => {
    const tasks = [task({ tags: ["work", "home"] }), task({ tags: ["work"] })];
    expect(collectTags(tasks)).toEqual(["home", "work"]);
  });

  it("copes with tasks that have no tags", () => {
    expect(collectTags([task({ tags: null })])).toEqual([]);
  });
});

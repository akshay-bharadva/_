import { describe, it, expect } from "vitest";
import type { Task, TaskDependency } from "@/types";
import {
  eligibleBlockers,
  indexDependencies,
  indexTasks,
  isBlocked,
  unmetBlockers,
  wouldCreateCycle,
} from "./task-dependencies";

const task = (id: string, status: Task["status"] = "todo"): Task => ({
  id,
  title: id,
  status,
  priority: "medium",
});

const dep = (taskId: string, dependsOnId: string): TaskDependency => ({
  id: `${taskId}<-${dependsOnId}`,
  task_id: taskId,
  depends_on_id: dependsOnId,
});

describe("indexDependencies", () => {
  it("indexes both directions", () => {
    const index = indexDependencies([dep("b", "a")]);
    expect(index.blockedBy.get("b")).toEqual(["a"]);
    expect(index.blocks.get("a")).toEqual(["b"]);
  });

  it("collects multiple blockers of one task", () => {
    const index = indexDependencies([dep("c", "a"), dep("c", "b")]);
    expect(index.blockedBy.get("c")).toEqual(["a", "b"]);
  });

  it("is empty for no dependencies", () => {
    expect(indexDependencies([]).blockedBy.size).toBe(0);
  });
});

describe("isBlocked / unmetBlockers", () => {
  it("blocks a task whose blocker is not done", () => {
    const tasks = [task("a"), task("b")];
    const index = indexDependencies([dep("b", "a")]);
    expect(isBlocked("b", index, indexTasks(tasks))).toBe(true);
  });

  /** The whole reason blocked is derived: completing the blocker must clear it
      with no second write anywhere. */
  it("unblocks as soon as the blocker is done", () => {
    const tasks = [task("a", "done"), task("b")];
    const index = indexDependencies([dep("b", "a")]);
    expect(isBlocked("b", index, indexTasks(tasks))).toBe(false);
  });

  it("stays blocked while any one blocker is outstanding", () => {
    const tasks = [task("a", "done"), task("b"), task("c")];
    const index = indexDependencies([dep("c", "a"), dep("c", "b")]);
    expect(
      unmetBlockers("c", index, indexTasks(tasks)).map((t) => t.id),
    ).toEqual(["b"]);
  });

  it("is not blocked with no dependencies at all", () => {
    expect(isBlocked("a", indexDependencies([]), indexTasks([task("a")]))).toBe(
      false,
    );
  });

  /** A cached edge can outlive its task by a moment; treating an unknown id as
      blocking would strand the task permanently. */
  it("treats a blocker that no longer exists as resolved", () => {
    const index = indexDependencies([dep("b", "deleted")]);
    expect(isBlocked("b", index, indexTasks([task("b")]))).toBe(false);
  });

  it("does not treat a task as blocked by the tasks it blocks", () => {
    const tasks = [task("a"), task("b")];
    const index = indexDependencies([dep("b", "a")]);
    expect(isBlocked("a", index, indexTasks(tasks))).toBe(false);
  });
});

describe("wouldCreateCycle", () => {
  it("rejects a self-dependency", () => {
    expect(wouldCreateCycle("a", "a", indexDependencies([]))).toBe(true);
  });

  it("rejects a direct reciprocal edge", () => {
    const index = indexDependencies([dep("b", "a")]);
    expect(wouldCreateCycle("a", "b", index)).toBe(true);
  });

  it("rejects an indirect loop", () => {
    // c waits on b, b waits on a. Making a wait on c closes the ring.
    const index = indexDependencies([dep("c", "b"), dep("b", "a")]);
    expect(wouldCreateCycle("a", "c", index)).toBe(true);
  });

  it("allows an edge that does not close a loop", () => {
    const index = indexDependencies([dep("b", "a")]);
    expect(wouldCreateCycle("c", "b", index)).toBe(false);
  });

  it("allows a diamond, which is not a cycle", () => {
    // b and c both wait on a; d waits on b and c.
    const index = indexDependencies([dep("b", "a"), dep("c", "a")]);
    expect(wouldCreateCycle("d", "b", index)).toBe(false);
  });

  /** A malformed graph must not hang the UI thread. */
  it("terminates on a graph that already contains a cycle", () => {
    const index = indexDependencies([dep("a", "b"), dep("b", "a")]);
    expect(wouldCreateCycle("c", "a", index)).toBe(false);
  });
});

describe("eligibleBlockers", () => {
  it("excludes the task itself", () => {
    const tasks = [task("a"), task("b")];
    const ids = eligibleBlockers("a", tasks, indexDependencies([])).map(
      (t) => t.id,
    );
    expect(ids).toEqual(["b"]);
  });

  it("excludes blockers already attached", () => {
    const tasks = [task("a"), task("b"), task("c")];
    const index = indexDependencies([dep("a", "b")]);
    expect(eligibleBlockers("a", tasks, index).map((t) => t.id)).toEqual(["c"]);
  });

  it("excludes candidates that would close a loop", () => {
    const tasks = [task("a"), task("b"), task("c")];
    const index = indexDependencies([dep("c", "b"), dep("b", "a")]);
    // Neither b nor c can block a without creating a ring.
    expect(eligibleBlockers("a", tasks, index)).toEqual([]);
  });

  it("returns everything else when the graph is empty", () => {
    const tasks = [task("a"), task("b"), task("c")];
    expect(eligibleBlockers("a", tasks, indexDependencies([]))).toHaveLength(2);
  });
});

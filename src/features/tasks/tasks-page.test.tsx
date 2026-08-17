import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Task, TaskDependency, TaskProject } from "@/types";
import TasksPage from "./tasks-page";

const updateTask = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const addTask = vi.fn<
  (task: Partial<Task>) => { unwrap: () => Promise<unknown> }
>(() => ({ unwrap: () => Promise.resolve({}) }));
const noop = () => ({ unwrap: () => Promise.resolve({}) });

let tasks: Task[] = [];
let projects: TaskProject[] = [];
let dependencies: TaskDependency[] = [];

vi.mock("@/store/api/adminApi", () => ({
  useGetTasksQuery: () => ({ data: tasks, isLoading: false }),
  useGetTaskProjectsQuery: () => ({ data: projects }),
  useGetTaskDependenciesQuery: () => ({ data: dependencies }),
  useAddTaskMutation: () => [addTask],
  useUpdateTaskMutation: () => [updateTask],
  useAddSubTaskMutation: () => [vi.fn(noop)],
  useUpdateSubTaskMutation: () => [vi.fn(noop)],
  useDeleteSubTaskMutation: () => [vi.fn(noop)],
  useAddTaskDependencyMutation: () => [vi.fn(noop)],
  useDeleteTaskDependencyMutation: () => [vi.fn(noop)],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => vi.fn(() => Promise.resolve(true)),
}));

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Write the thing",
  status: "todo",
  priority: "medium",
  display_order: 1,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  tasks = [];
  projects = [];
  dependencies = [];
});

describe("TasksPage", () => {
  it("shows an empty state with no tasks", () => {
    render(<TasksPage />);
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
  });

  it("renders a column per status, including empty ones", () => {
    tasks = [task()];
    render(<TasksPage />);
    for (const label of ["To Do", "In Progress", "In Review", "Done"]) {
      expect(screen.getByRole("region", { name: label })).toBeInTheDocument();
    }
  });

  /** Derived from the graph, never stored — see task-dependencies.ts. */
  it("marks a task blocked by an unfinished dependency", () => {
    tasks = [
      task({ id: "a", title: "Buy paint" }),
      task({ id: "b", title: "Paint wall" }),
    ];
    dependencies = [{ id: "d1", task_id: "b", depends_on_id: "a" }];
    render(<TasksPage />);
    expect(screen.getByText(/Blocked by Buy paint/)).toBeInTheDocument();
  });

  it("stops showing blocked once the blocker is done", () => {
    tasks = [
      task({ id: "a", title: "Buy paint", status: "done" }),
      task({ id: "b", title: "Paint wall" }),
    ];
    dependencies = [{ id: "d1", task_id: "b", depends_on_id: "a" }];
    render(<TasksPage />);
    expect(screen.queryByText(/Blocked by/)).not.toBeInTheDocument();
  });

  it("filters to blocked tasks", () => {
    tasks = [
      task({ id: "a", title: "Buy paint" }),
      task({ id: "b", title: "Paint wall" }),
    ];
    dependencies = [{ id: "d1", task_id: "b", depends_on_id: "a" }];
    render(<TasksPage />);
    fireEvent.click(screen.getByRole("button", { name: /Blocked/ }));
    expect(screen.getByLabelText("Paint wall")).toBeInTheDocument();
    expect(screen.queryByLabelText("Buy paint")).not.toBeInTheDocument();
  });

  it("hides completed work when asked", () => {
    tasks = [
      task({ id: "a", title: "Done thing", status: "done" }),
      task({ id: "b", title: "Open thing" }),
    ];
    render(<TasksPage />);
    fireEvent.click(screen.getByRole("button", { name: /Hide done/ }));
    expect(screen.queryByLabelText("Done thing")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Open thing")).toBeInTheDocument();
  });

  it("searches across titles", () => {
    tasks = [
      task({ id: "a", title: "Renew passport" }),
      task({ id: "b", title: "Buy milk" }),
    ];
    render(<TasksPage />);
    fireEvent.change(screen.getByLabelText("Search tasks"), {
      target: { value: "passport" },
    });
    expect(screen.getByLabelText("Renew passport")).toBeInTheDocument();
    expect(screen.queryByLabelText("Buy milk")).not.toBeInTheDocument();
  });

  it("switches between the four views", () => {
    tasks = [task({ due_date: "2026-06-15" })];
    render(<TasksPage />);
    fireEvent.click(screen.getByLabelText("Table view"));
    expect(screen.getByRole("table")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Timeline view"));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says why nothing is on the timeline when no task has a due date", () => {
    tasks = [task({ due_date: null })];
    render(<TasksPage />);
    fireEvent.click(screen.getByLabelText("Timeline view"));
    expect(screen.getByText(/needs a due date/)).toBeInTheDocument();
  });

  it("offers grouping only for the grouped views", () => {
    tasks = [task()];
    render(<TasksPage />);
    expect(
      screen.queryByRole("group", { name: "Group by" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Table view"));
    expect(screen.getByRole("group", { name: "Group by" })).toBeInTheDocument();
  });

  /**
   * The behaviour that makes recurrence worth having: completing an instance
   * schedules the next one instead of resetting this one, so the history of
   * what was finished survives.
   */
  it("schedules the next instance when a repeating task is completed", async () => {
    tasks = [
      task({
        id: "r1",
        title: "Water plants",
        due_date: "2026-06-15",
        recurrence: "weekly",
        recurrence_interval: 1,
      }),
    ];
    render(<TasksPage />);

    const card = screen.getByLabelText("Water plants");
    fireEvent.dragStart(card);
    const doneColumn = screen.getByRole("region", { name: "Done" });
    fireEvent.dragOver(doneColumn);
    fireEvent.drop(doneColumn);

    await waitFor(() => expect(updateTask).toHaveBeenCalled());
    await waitFor(() => expect(addTask).toHaveBeenCalled());
    expect(addTask.mock.calls[0]?.[0]).toMatchObject({
      title: "Water plants",
      due_date: "2026-06-22",
      status: "todo",
    });
  });

  it("does not schedule anything when a one-off task is completed", async () => {
    tasks = [task({ id: "o1", title: "One off", due_date: "2026-06-15" })];
    render(<TasksPage />);

    fireEvent.dragStart(screen.getByLabelText("One off"));
    const doneColumn = screen.getByRole("region", { name: "Done" });
    fireEvent.dragOver(doneColumn);
    fireEvent.drop(doneColumn);

    await waitFor(() => expect(updateTask).toHaveBeenCalled());
    expect(addTask).not.toHaveBeenCalled();
  });

  it("groups by project and separates unassigned tasks", () => {
    projects = [{ id: "p1", name: "House" }];
    tasks = [
      task({ id: "a", title: "Fix door", project_id: "p1" }),
      task({ id: "b", title: "Loose end", project_id: null }),
    ];
    render(<TasksPage />);
    fireEvent.click(screen.getByLabelText("Table view"));
    const groupBy = screen.getByRole("group", { name: "Group by" });
    fireEvent.click(within(groupBy).getByRole("button", { name: "project" }));
    // The group header rows, not the Project column cells or the filter chips.
    const table = screen.getByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((el) => el.textContent ?? "");
    expect(headers.some((h) => h.startsWith("House"))).toBe(true);
    expect(headers.some((h) => h.startsWith("No project"))).toBe(true);
  });
});

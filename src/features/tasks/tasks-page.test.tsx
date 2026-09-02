import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import focusReducer from "@/store/slices/focusSlice";
import type { Task, TaskDependency, TaskProject } from "@/types";
import TasksPage from "./tasks-page";

/**
 * Only the focus slice, which is what the page dispatches to when starting a
 * timer on a task. The real store wires in adminApi, and adminApi is mocked
 * here, so its reducerPath would be undefined.
 */
const renderPage = () =>
  render(
    <Provider store={configureStore({ reducer: { focus: focusReducer } })}>
      <TasksPage />
    </Provider>,
  );

const updateTask = vi.fn<
  (task: Partial<Task>) => { unwrap: () => Promise<unknown> }
>(() => ({ unwrap: () => Promise.resolve({}) }));
const updateTaskOrder = vi.fn(() => ({ unwrap: () => Promise.resolve(null) }));
const deleteTask = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const addProject = vi.fn<
  (project: { name: string }) => { unwrap: () => Promise<unknown> }
>(() => ({ unwrap: () => Promise.resolve({}) }));
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
  useDeleteTaskMutation: () => [deleteTask],
  useUpdateTaskOrderMutation: () => [updateTaskOrder],
  useAddTaskProjectMutation: () => [addProject],
  useUpdateTaskProjectMutation: () => [vi.fn(noop)],
  useDeleteTaskProjectMutation: () => [vi.fn(noop)],
  useAddSubTaskMutation: () => [vi.fn(noop)],
  useUpdateSubTaskMutation: () => [vi.fn(noop)],
  useDeleteSubTaskMutation: () => [vi.fn(noop)],
  useAddTaskDependencyMutation: () => [vi.fn(noop)],
  useDeleteTaskDependencyMutation: () => [vi.fn(noop)],
}));

const confirmSpy =
  vi.fn<
    (options: { title: string; description: string }) => Promise<boolean>
  >();

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => confirmSpy,
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
  confirmSpy.mockResolvedValue(true);
  tasks = [];
  projects = [];
  dependencies = [];
});

describe("TasksPage", () => {
  it("shows an empty state with no tasks", () => {
    renderPage();
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
  });

  it("renders a column per status, including empty ones", () => {
    tasks = [task()];
    renderPage();
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
    renderPage();
    expect(screen.getByText(/Blocked by Buy paint/)).toBeInTheDocument();
  });

  it("stops showing blocked once the blocker is done", () => {
    tasks = [
      task({ id: "a", title: "Buy paint", status: "done" }),
      task({ id: "b", title: "Paint wall" }),
    ];
    dependencies = [{ id: "d1", task_id: "b", depends_on_id: "a" }];
    renderPage();
    expect(screen.queryByText(/Blocked by/)).not.toBeInTheDocument();
  });

  it("filters to blocked tasks", () => {
    tasks = [
      task({ id: "a", title: "Buy paint" }),
      task({ id: "b", title: "Paint wall" }),
    ];
    dependencies = [{ id: "d1", task_id: "b", depends_on_id: "a" }];
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.click(screen.getByLabelText("Blocked"));
    expect(screen.getByLabelText("Paint wall")).toBeInTheDocument();
    expect(screen.queryByLabelText("Buy paint")).not.toBeInTheDocument();
  });

  it("hides completed work when asked", () => {
    tasks = [
      task({ id: "a", title: "Done thing", status: "done" }),
      task({ id: "b", title: "Open thing" }),
    ];
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.click(screen.getByLabelText("Hide completed"));
    expect(screen.queryByLabelText("Done thing")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Open thing")).toBeInTheDocument();
  });

  it("searches across titles", () => {
    tasks = [
      task({ id: "a", title: "Renew passport" }),
      task({ id: "b", title: "Buy milk" }),
    ];
    renderPage();
    fireEvent.change(screen.getByLabelText("Search tasks"), {
      target: { value: "passport" },
    });
    expect(screen.getByLabelText("Renew passport")).toBeInTheDocument();
    expect(screen.queryByLabelText("Buy milk")).not.toBeInTheDocument();
  });

  it("switches between the four views", () => {
    tasks = [task({ due_date: "2026-06-15" })];
    renderPage();
    fireEvent.click(screen.getByLabelText("Table view"));
    expect(screen.getByRole("table")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Timeline view"));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says why nothing is on the timeline when no task has a due date", () => {
    tasks = [task({ due_date: null })];
    renderPage();
    fireEvent.click(screen.getByLabelText("Timeline view"));
    expect(screen.getByText(/needs a due date/)).toBeInTheDocument();
  });

  it("offers grouping only for the grouped views", () => {
    tasks = [task()];
    renderPage();
    // Grouping is meaningless on a board, whose columns are the grouping.
    expect(screen.queryByLabelText("Group by")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Table view"));
    expect(screen.getByLabelText("Group by")).toBeInTheDocument();
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
    renderPage();

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
    renderPage();

    fireEvent.dragStart(screen.getByLabelText("One off"));
    const doneColumn = screen.getByRole("region", { name: "Done" });
    fireEvent.dragOver(doneColumn);
    fireEvent.drop(doneColumn);

    await waitFor(() => expect(updateTask).toHaveBeenCalled());
    expect(addTask).not.toHaveBeenCalled();
  });

  it("offers projects as navigation with counts", () => {
    projects = [{ id: "p1", name: "House" }];
    tasks = [
      task({ id: "a", title: "Fix door", project_id: "p1" }),
      task({ id: "b", title: "Loose end", project_id: null }),
    ];
    renderPage();
    const rail = screen.getByRole("navigation", { name: "Projects" });
    expect(
      within(rail).getByRole("button", { name: /House/ }),
    ).toBeInTheDocument();
    expect(
      within(rail).getByRole("button", { name: /No project/ }),
    ).toBeInTheDocument();
  });

  it("filters to a project from the rail", () => {
    projects = [{ id: "p1", name: "House" }];
    tasks = [
      task({ id: "a", title: "Fix door", project_id: "p1" }),
      task({ id: "b", title: "Loose end", project_id: null }),
    ];
    renderPage();
    const rail = screen.getByRole("navigation", { name: "Projects" });
    fireEvent.click(within(rail).getByRole("button", { name: /House/ }));
    expect(screen.getByLabelText("Fix door")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loose end")).not.toBeInTheDocument();
  });
  /* ── Regressions from the first pass of this rebuild ───────────────── */

  /**
   * The List toggle fell through to the table renderer: the projects CRUD API
   * was wired with no UI, and task deletion was dropped entirely.
   */
  it("renders a list, not the table, in list view", () => {
    tasks = [task({ title: "Walk dog" })];
    renderPage();
    fireEvent.click(screen.getByLabelText("List view"));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Complete Walk dog")).toBeInTheDocument();
  });

  it("completes a task from the list without opening the panel", async () => {
    tasks = [task({ id: "a", title: "Walk dog" })];
    renderPage();
    fireEvent.click(screen.getByLabelText("List view"));
    fireEvent.click(screen.getByLabelText("Complete Walk dog"));
    await waitFor(() => expect(updateTask).toHaveBeenCalled());
    expect(updateTask.mock.calls[0]?.[0]).toMatchObject({ status: "done" });
  });

  it("reopens a completed task from its checkbox", async () => {
    tasks = [task({ id: "a", title: "Walk dog", status: "done" })];
    renderPage();
    fireEvent.click(screen.getByLabelText("List view"));
    fireEvent.click(screen.getByLabelText("Reopen Walk dog"));
    await waitFor(() => expect(updateTask).toHaveBeenCalled());
    expect(updateTask.mock.calls[0]?.[0]).toMatchObject({ status: "todo" });
  });

  it("opens a way to create a project", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Projects/ }));
    expect(screen.getByLabelText("New project")).toBeInTheDocument();
  });

  it("creates a project", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Projects/ }));
    fireEvent.change(screen.getByLabelText("New project"), {
      target: { value: "House" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    await waitFor(() => expect(addProject).toHaveBeenCalled());
    expect(addProject.mock.calls[0]?.[0]).toMatchObject({ name: "House" });
  });

  it("refuses to create a project with a blank name", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Projects/ }));
    expect(screen.getByRole("button", { name: "Add project" })).toBeDisabled();
    expect(addProject).not.toHaveBeenCalled();
  });

  it("offers every project when choosing one for a task", () => {
    projects = [{ id: "p1", name: "House" }];
    // A task exists so the empty state (which has its own "New task") is gone.
    tasks = [task()];
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    expect(
      screen.getByRole("combobox", { name: /Project/ }),
    ).toBeInTheDocument();
  });

  /**
   * Deletion was dropped entirely in the first pass of this rebuild. Asserted
   * through the task panel rather than the card's dropdown, which needs real
   * pointer events jsdom does not implement.
   */
  it("deletes a task from the task panel", async () => {
    tasks = [task({ id: "a", title: "Walk dog" })];
    renderPage();
    fireEvent.click(screen.getByLabelText("Walk dog"));
    // The sheet opens read-only now; editing is a deliberate second action.
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: /Delete/ }));
    await waitFor(() => expect(deleteTask).toHaveBeenCalledWith("a"));
  });

  it("warns that deleting a task unblocks whatever waits on it", async () => {
    tasks = [
      task({ id: "a", title: "Buy paint" }),
      task({ id: "b", title: "Paint wall" }),
    ];
    dependencies = [{ id: "d1", task_id: "b", depends_on_id: "a" }];
    renderPage();
    fireEvent.click(screen.getByLabelText("Buy paint"));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: /Delete/ }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(confirmSpy.mock.calls[0]?.[0]?.description).toMatch(
      /will no longer be blocked/,
    );
  });
});

describe("view before edit", () => {
  /**
   * Clicking a task opened the edit form directly, so every glance at
   * something put its every field one stray keystroke from a change. The
   * sheet reads first; Edit is a deliberate second action.
   */
  it("opens a task read-only", async () => {
    tasks = [task({ id: "a", title: "Walk dog" })];
    renderPage();

    fireEvent.click(screen.getByLabelText("Walk dog"));

    expect(
      await screen.findByRole("button", { name: "Edit" }),
    ).toBeInTheDocument();
    // The title field is the form's, and it must not be there yet.
    expect(screen.queryByLabelText(/^Title/i)).toBeNull();
  });

  it("shows the form once Edit is pressed", async () => {
    tasks = [task({ id: "a", title: "Walk dog" })];
    renderPage();

    fireEvent.click(screen.getByLabelText("Walk dog"));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

    expect(await screen.findByLabelText(/^Title/i)).toBeInTheDocument();
  });

  /** Creating has nothing to read, so it goes straight to the form. */
  it("opens a new task straight into the form", async () => {
    tasks = [];
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /New task/i })[0]);

    expect(await screen.findByLabelText(/^Title/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import focusReducer, { startFocus } from "@/store/slices/focusSlice";
import { FocusTimer } from "./focus-timer";

const logSession = vi.fn<
  (args: {
    duration_minutes: number;
    task_id?: string | null;
    mode: string;
  }) => { unwrap: () => Promise<unknown> }
>(() => ({ unwrap: () => Promise.resolve(null) }));
const addTaskTime = vi.fn<
  (args: { taskId: string; minutes: number }) => {
    unwrap: () => Promise<unknown>;
  }
>(() => ({ unwrap: () => Promise.resolve(null) }));

vi.mock("@/store/api/adminApi", () => ({
  useLogFocusSessionMutation: () => [logSession],
  useAddTaskTimeMutation: () => [addTaskTime],
}));

/** A running session with `elapsed` minutes already spent. */
function renderRunning(options: {
  durationMinutes: number;
  elapsedMinutes: number;
  taskId?: string;
}) {
  const store = configureStore({ reducer: { focus: focusReducer } });
  store.dispatch(
    startFocus({
      durationMinutes: options.durationMinutes,
      taskTitle: "Write the report",
      taskId: options.taskId,
    }),
  );
  // Advance the clock by dispatching ticks, which is how the real timer moves.
  for (let i = 0; i < options.elapsedMinutes * 60; i++) {
    store.dispatch({ type: "focus/tick" });
  }

  render(
    <Provider store={store}>
      <FocusTimer />
    </Provider>,
  );
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FocusTimer time capture", () => {
  /**
   * The bug this covers: stopping early used to dispatch stopFocus and nothing
   * else, so the minutes actually worked were discarded. Only a session that
   * ran the full duration was ever logged.
   */
  it("logs the elapsed minutes when stopped early", async () => {
    renderRunning({ durationMinutes: 25, elapsedMinutes: 10, taskId: "t1" });

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));

    await waitFor(() => expect(logSession).toHaveBeenCalled());
    expect(logSession.mock.calls[0]?.[0]).toMatchObject({
      duration_minutes: 10,
      task_id: "t1",
    });
  });

  it("adds the elapsed minutes to the task itself", async () => {
    renderRunning({ durationMinutes: 25, elapsedMinutes: 10, taskId: "t1" });

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));

    await waitFor(() => expect(addTaskTime).toHaveBeenCalled());
    expect(addTaskTime.mock.calls[0]?.[0]).toEqual({
      taskId: "t1",
      minutes: 10,
    });
  });

  /** Logs the session for the record, but has no task to attribute it to. */
  it("logs a session with no task without trying to update one", async () => {
    renderRunning({ durationMinutes: 25, elapsedMinutes: 5 });

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));

    await waitFor(() => expect(logSession).toHaveBeenCalled());
    expect(addTaskTime).not.toHaveBeenCalled();
  });

  /** Nothing meaningful happened; recording 0m would be noise. */
  it("records nothing when stopped within the first minute", async () => {
    renderRunning({ durationMinutes: 25, elapsedMinutes: 0, taskId: "t1" });

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));

    await waitFor(() =>
      expect(screen.queryByText(/Write the report/)).not.toBeInTheDocument(),
    );
    expect(logSession).not.toHaveBeenCalled();
    expect(addTaskTime).not.toHaveBeenCalled();
  });

  it("clears the timer after stopping", async () => {
    renderRunning({ durationMinutes: 25, elapsedMinutes: 3, taskId: "t1" });

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));

    await waitFor(() =>
      expect(screen.queryByText(/Write the report/)).not.toBeInTheDocument(),
    );
  });
});

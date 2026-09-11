import { describe, it, expect } from "vitest";
import { classifySetupError } from "./setup-status";

describe("classifySetupError", () => {
  it("is ready when the probe succeeded", () => {
    expect(classifySetupError(null)).toBe("ready");
  });

  /** The schema has not been run: the function sign-in calls is missing. */
  it("recognises a missing function or table", () => {
    expect(classifySetupError({ code: "PGRST202", message: "" })).toBe("no-schema");
    expect(classifySetupError({ code: "42P01", message: "" })).toBe("no-schema");
    expect(
      classifySetupError({
        message:
          "Could not find the function public.check_admin_exists without parameters in the schema cache",
      }),
    ).toBe("no-schema");
  });

  it("treats anything else as unreachable, not as missing", () => {
    expect(classifySetupError({ message: "Failed to fetch" })).toBe("unreachable");
  });
});

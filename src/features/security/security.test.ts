import { describe, it, expect } from "vitest";
import {
  LOCKDOWN_LEVELS,
  isPublicHidden,
  lockdownConfirmation,
  lockdownMeta,
  writesBlocked,
} from "./lockdown";
import {
  PASSWORD_MIN_LENGTH,
  assessPassword,
  passwordFormError,
} from "./password-strength";

describe("lockdownMeta", () => {
  it("describes every defined level", () => {
    for (const level of LOCKDOWN_LEVELS) {
      expect(lockdownMeta(level.level).title).toBe(level.title);
    }
  });

  /**
   * The column permits 0-3 but only three levels are defined. Guessing
   * "probably fine" about a security setting is the wrong direction to be
   * wrong in.
   */
  it("treats an unknown level as fully locked down", () => {
    const meta = lockdownMeta(3);
    expect(meta.tone).toBe("critical");
    expect(meta.enforcement).toBe("database");
    expect(writesBlocked(3)).toBe(true);
    expect(isPublicHidden(3)).toBe(true);
  });

  /** The claim on each level has to match where it is actually applied. */
  it("names where each level is enforced", () => {
    expect(lockdownMeta(0).enforcement).toBe("none");
    expect(lockdownMeta(1).enforcement).toBe("client");
    expect(lockdownMeta(2).enforcement).toBe("database");
  });
});

describe("isPublicHidden / writesBlocked", () => {
  it("hides the public site from level 1 up", () => {
    expect(isPublicHidden(0)).toBe(false);
    expect(isPublicHidden(1)).toBe(true);
    expect(isPublicHidden(2)).toBe(true);
  });

  it("blocks writes only from level 2 up", () => {
    expect(writesBlocked(0)).toBe(false);
    expect(writesBlocked(1)).toBe(false);
    expect(writesBlocked(2)).toBe(true);
  });
});

describe("lockdownConfirmation", () => {
  /**
   * The previous implementation indexed an array of three messages by level,
   * so a level the array had no entry for produced a confirm dialog with no
   * description — at the exact moment one matters most.
   */
  it("has a description for every level the column allows", () => {
    for (const level of [0, 1, 2, 3]) {
      const confirmation = lockdownConfirmation(level);
      expect(confirmation.title).toBeTruthy();
      expect(confirmation.description).toBeTruthy();
    }
  });

  it("marks only lockdown as destructive", () => {
    expect(lockdownConfirmation(0).destructive).toBe(false);
    expect(lockdownConfirmation(1).destructive).toBe(false);
    expect(lockdownConfirmation(2).destructive).toBe(true);
  });

  /** Lockdown must never be able to trap the owner inside it. */
  it("says the level itself can always be changed back", () => {
    expect(lockdownConfirmation(2).description).toMatch(/never blocked/);
  });
});

describe("assessPassword", () => {
  it("rejects an empty password", () => {
    const result = assessPassword("");
    expect(result.acceptable).toBe(false);
    expect(result.score).toBe(0);
  });

  /** Six characters was the only rule, and it is the floor Supabase already
      enforces — so the field checked nothing. */
  it("rejects anything shorter than the minimum", () => {
    expect(assessPassword("Ab1!x").acceptable).toBe(false);
    expect(assessPassword("Abcd1234!").acceptable).toBe(false);
    expect(assessPassword("a".repeat(PASSWORD_MIN_LENGTH - 1)).acceptable).toBe(
      false,
    );
  });

  it("accepts a long mixed password", () => {
    const result = assessPassword("7Kp!wqz#Lm2vRt");
    expect(result.acceptable).toBe(true);
    expect(result.suggestions).toEqual([]);
  });

  /** A long passphrase is strong; demanding a symbol inside one is theatre. */
  it("accepts a long passphrase without symbols", () => {
    expect(assessPassword("correct horse battery staple").acceptable).toBe(
      true,
    );
  });

  it("refuses a common word however long the password is", () => {
    const result = assessPassword("mysuperlongpassword123");
    expect(result.acceptable).toBe(false);
    expect(result.suggestions.join(" ")).toMatch(/common words/);
  });

  it("flags obvious runs and repeats", () => {
    expect(assessPassword("abcdefgh123456!!").suggestions.join(" ")).toMatch(
      /runs/,
    );
    expect(assessPassword("Zqxjvv!aaa8kdlm2").suggestions.join(" ")).toMatch(
      /runs/,
    );
  });

  it("asks for a mix when there is none", () => {
    expect(assessPassword("kdjfhqmzptrwbnvx").suggestions.join(" ")).toMatch(
      /Mix letters/,
    );
  });

  it("scores longer and more varied passwords higher", () => {
    const weak = assessPassword("kdjfhqmzptrw");
    const strong = assessPassword("7Kp!wqz#Lm2vRt9Xb$dF");
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.label).toBe("Strong");
  });

  it("labels a too-short password as such rather than merely weak", () => {
    expect(assessPassword("Ab1!").label).toBe("Too short");
  });

  it("keeps the score inside its range", () => {
    for (const candidate of ["", "a", "password", "7Kp!wqz#Lm2vRt9Xb$dFqW2"]) {
      const { score } = assessPassword(candidate);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(4);
    }
  });
});

describe("passwordFormError", () => {
  const good = "7Kp!wqz#Lm2vRt";

  it("passes a good, matching pair", () => {
    expect(passwordFormError(good, good)).toBeNull();
  });

  it("reports a mismatch", () => {
    expect(passwordFormError(good, `${good}x`)).toMatch(/do not match/);
  });

  /** Quality first: telling someone their weak passwords match is useless. */
  it("reports quality before it reports a mismatch", () => {
    expect(passwordFormError("short", "different")).toMatch(/at least/);
  });
});

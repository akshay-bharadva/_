import { describe, it, expect } from "vitest";
import {
  FileArchive,
  FileAudio,
  FileCode,
  File as FileIcon,
  FileText,
  FileVideo,
} from "lucide-react";
import {
  PLACEHOLDER_FILENAME,
  getAllFolderPaths,
  getAssetsForPath,
  getFileIcon,
  sanitizeFolderName,
} from "./asset-utils";

type Asset = { file_path: string; file_name: string };

const asset = (file_path: string): Asset => ({
  file_path,
  file_name: file_path.split("/").pop() as string,
});

const tree: Asset[] = [
  asset("logo.png"),
  asset("projects/hero.jpg"),
  asset("projects/2026/case-study.pdf"),
  asset("blog/cover.webp"),
  asset(`blog/drafts/${PLACEHOLDER_FILENAME}`),
];

describe("getFileIcon", () => {
  it("returns null for images so the caller can render a thumbnail instead", () => {
    expect(getFileIcon("image/png")).toBeNull();
    expect(getFileIcon("image/svg+xml")).toBeNull();
  });

  it.each([
    ["video/mp4", FileVideo],
    ["audio/mpeg", FileAudio],
    ["application/pdf", FileText],
    ["application/zip", FileArchive],
    ["application/x-tar", FileArchive],
    ["application/json", FileCode],
    ["text/html", FileCode],
  ])("maps %s to its icon", (mimeType, icon) => {
    expect(getFileIcon(mimeType)?.type).toBe(icon);
  });

  it("falls back to the generic file icon for unknown and missing types", () => {
    expect(getFileIcon("application/octet-stream")?.type).toBe(FileIcon);
    expect(getFileIcon(null)?.type).toBe(FileIcon);
  });

  it("forwards the className to the icon", () => {
    expect(getFileIcon("video/mp4", "size-4")?.props.className).toBe("size-4");
  });
});

describe("getAllFolderPaths", () => {
  it("collects every parent directory, sorted and deduplicated", () => {
    expect(getAllFolderPaths(tree)).toEqual([
      "blog",
      "blog/drafts",
      "projects",
      "projects/2026",
    ]);
  });

  it("ignores root-level files, which have no parent directory", () => {
    expect(getAllFolderPaths([asset("logo.png")])).toEqual([]);
  });

  it("returns an empty list for an empty bucket", () => {
    expect(getAllFolderPaths([])).toEqual([]);
  });
});

describe("getAssetsForPath", () => {
  it("splits the root into its own files and immediate subfolders", () => {
    const { currentFolderAssets, subFolders } = getAssetsForPath(tree, []);
    expect(subFolders).toEqual(["blog", "projects"]);
    expect(currentFolderAssets.map((a) => a.file_path)).toEqual(["logo.png"]);
  });

  it("scopes to a nested path and only reports its direct children", () => {
    const { currentFolderAssets, subFolders } = getAssetsForPath(tree, [
      "projects",
    ]);
    expect(subFolders).toEqual(["2026"]);
    expect(currentFolderAssets.map((a) => a.file_path)).toEqual([
      "projects/hero.jpg",
    ]);
  });

  it("hides the empty-folder placeholder from the file list", () => {
    const { currentFolderAssets, subFolders } = getAssetsForPath(tree, [
      "blog",
      "drafts",
    ]);
    expect(subFolders).toEqual([]);
    expect(currentFolderAssets).toEqual([]);
  });

  it("still surfaces a folder that contains only a placeholder", () => {
    expect(getAssetsForPath(tree, ["blog"]).subFolders).toEqual(["drafts"]);
  });

  it("returns nothing for a path that does not exist", () => {
    expect(getAssetsForPath(tree, ["nope"])).toEqual({
      subFolders: [],
      currentFolderAssets: [],
    });
  });

  it("matches on the full path segment, not a bare prefix", () => {
    // "projects-archive/" must not be swept into "projects/".
    const withSibling = [...tree, asset("projects-archive/old.png")];
    const { currentFolderAssets } = getAssetsForPath(withSibling, ["projects"]);
    expect(currentFolderAssets.map((a) => a.file_path)).toEqual([
      "projects/hero.jpg",
    ]);
  });
});

describe("sanitizeFolderName", () => {
  it("keeps a normal name", () => {
    expect(sanitizeFolderName("screenshots")).toBe("screenshots");
    expect(sanitizeFolderName("my-folder_2")).toBe("my-folder_2");
  });

  it("replaces characters that are not path-safe", () => {
    expect(sanitizeFolderName("my folder")).toBe("my_folder");
    expect(sanitizeFolderName("a/b")).toBe("a_b");
  });

  it("rejects traversal segments", () => {
    // `.` is allowlisted by the character filter, so `..` used to survive
    // untouched and be interpolated straight into the storage key.
    expect(sanitizeFolderName("..")).toBeNull();
    expect(sanitizeFolderName(".")).toBeNull();
    expect(sanitizeFolderName("../..")).toBe("_..");
  });

  it("strips a leading dot so folders are not hidden", () => {
    expect(sanitizeFolderName(".hidden")).toBe("hidden");
  });

  it("rejects names with nothing usable left", () => {
    expect(sanitizeFolderName("")).toBeNull();
    expect(sanitizeFolderName("   ")).toBeNull();
    expect(sanitizeFolderName("///")).toBeNull();
  });
});

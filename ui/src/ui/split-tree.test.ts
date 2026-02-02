import { describe, it, expect } from "vitest";
import {
  createLeaf,
  splitLeaf,
  removeLeaf,
  findLeaf,
  allLeaves,
  allThreadIds,
  setLeafThread,
  swapLeafThreads,
  buildBalancedTree,
  serializeLayout,
  deserializeLayout,
  type SplitPaneLayout,
  type SplitBranch,
} from "./split-tree";

describe("split-tree", () => {
  describe("createLeaf", () => {
    it("creates a leaf with the given threadId", () => {
      const leaf = createLeaf("session-1");
      expect(leaf.kind).toBe("leaf");
      expect(leaf.threadId).toBe("session-1");
      expect(leaf.id).toBeTruthy();
    });

    it("uses a custom id when provided", () => {
      const leaf = createLeaf("session-1", "custom-id");
      expect(leaf.id).toBe("custom-id");
      expect(leaf.threadId).toBe("session-1");
    });
  });

  describe("splitLeaf", () => {
    it("produces a branch with two children", () => {
      const leaf = createLeaf("t1", "p1");
      const result = splitLeaf(leaf, "p1", "horizontal", "t2");

      expect(result.kind).toBe("branch");
      const branch = result as SplitBranch;
      expect(branch.direction).toBe("horizontal");
      expect(branch.ratio).toBe(0.5);
      expect(branch.first.kind).toBe("leaf");
      expect(branch.second.kind).toBe("leaf");
      expect((branch.first as ReturnType<typeof createLeaf>).threadId).toBe("t1");
      expect((branch.second as ReturnType<typeof createLeaf>).threadId).toBe("t2");
    });

    it("returns unchanged tree when target pane not found", () => {
      const leaf = createLeaf("t1", "p1");
      const result = splitLeaf(leaf, "nonexistent", "vertical", "t2");
      expect(result).toBe(leaf);
    });
  });

  describe("removeLeaf", () => {
    it("returns null when removing the only leaf", () => {
      const leaf = createLeaf("t1", "p1");
      expect(removeLeaf(leaf, "p1")).toBeNull();
    });

    it("returns sibling when removing one child of a branch", () => {
      const leaf = createLeaf("t1", "p1");
      const tree = splitLeaf(leaf, "p1", "horizontal", "t2");
      const secondId = (tree as SplitBranch).second.id;

      const result = removeLeaf(tree, "p1");
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("leaf");
      expect(result!.id).toBe(secondId);
    });

    it("returns unchanged tree when pane not found", () => {
      const leaf = createLeaf("t1", "p1");
      expect(removeLeaf(leaf, "nonexistent")).toBe(leaf);
    });
  });

  describe("findLeaf", () => {
    it("finds a leaf by paneId", () => {
      const leaf = createLeaf("t1", "p1");
      expect(findLeaf(leaf, "p1")).toBe(leaf);
    });

    it("finds a leaf in a nested tree", () => {
      const leaf = createLeaf("t1", "p1");
      const tree = splitLeaf(leaf, "p1", "horizontal", "t2");
      const found = findLeaf(tree, "p1");
      expect(found).not.toBeNull();
      expect(found!.threadId).toBe("t1");
    });

    it("returns null when pane not found", () => {
      const leaf = createLeaf("t1", "p1");
      expect(findLeaf(leaf, "nonexistent")).toBeNull();
    });
  });

  describe("allLeaves", () => {
    it("returns single leaf for a leaf node", () => {
      const leaf = createLeaf("t1", "p1");
      const leaves = allLeaves(leaf);
      expect(leaves).toHaveLength(1);
      expect(leaves[0]).toBe(leaf);
    });

    it("collects all leaves from a tree", () => {
      const leaf = createLeaf("t1", "p1");
      const tree = splitLeaf(leaf, "p1", "horizontal", "t2");
      const leaves = allLeaves(tree);
      expect(leaves).toHaveLength(2);
      expect(leaves.map((l) => l.threadId)).toEqual(["t1", "t2"]);
    });
  });

  describe("allThreadIds", () => {
    it("deduplicates thread IDs", () => {
      // Build a tree then set both leaves to the same threadId
      const leaf = createLeaf("t1", "p1");
      const tree = splitLeaf(leaf, "p1", "horizontal", "t1");
      const ids = allThreadIds(tree);
      expect(ids).toEqual(["t1"]);
    });

    it("returns unique thread IDs in order", () => {
      const leaf = createLeaf("t1", "p1");
      const tree = splitLeaf(leaf, "p1", "horizontal", "t2");
      const ids = allThreadIds(tree);
      expect(ids).toEqual(["t1", "t2"]);
    });
  });

  describe("setLeafThread", () => {
    it("replaces threadId on the correct leaf", () => {
      const leaf = createLeaf("t1", "p1");
      const result = setLeafThread(leaf, "p1", "t2");
      expect(result.kind).toBe("leaf");
      expect((result as ReturnType<typeof createLeaf>).threadId).toBe("t2");
    });

    it("does not modify other leaves", () => {
      const leaf = createLeaf("t1", "p1");
      const tree = splitLeaf(leaf, "p1", "horizontal", "t2");
      const secondId = (tree as SplitBranch).second.id;

      const result = setLeafThread(tree, "p1", "t3");
      const leaves = allLeaves(result);
      expect(leaves.find((l) => l.id === "p1")!.threadId).toBe("t3");
      expect(leaves.find((l) => l.id === secondId)!.threadId).toBe("t2");
    });
  });

  describe("swapLeafThreads", () => {
    it("swaps threadIds of two leaves", () => {
      const leaf = createLeaf("t1", "p1");
      const tree = splitLeaf(leaf, "p1", "horizontal", "t2");
      const secondId = (tree as SplitBranch).second.id;

      const result = swapLeafThreads(tree, "p1", secondId);
      const leaves = allLeaves(result);
      expect(leaves.find((l) => l.id === "p1")!.threadId).toBe("t2");
      expect(leaves.find((l) => l.id === secondId)!.threadId).toBe("t1");
    });

    it("returns unchanged tree when swapping same pane", () => {
      const leaf = createLeaf("t1", "p1");
      const result = swapLeafThreads(leaf, "p1", "p1");
      expect(result).toBe(leaf);
    });
  });

  describe("buildBalancedTree", () => {
    it("creates a single leaf for one key", () => {
      const tree = buildBalancedTree(["s1"]);
      expect(tree.kind).toBe("leaf");
      expect((tree as ReturnType<typeof createLeaf>).threadId).toBe("s1");
    });

    it("creates a fallback leaf for empty input", () => {
      const tree = buildBalancedTree([]);
      expect(tree.kind).toBe("leaf");
      expect((tree as ReturnType<typeof createLeaf>).threadId).toBe("main");
    });

    it("creates a branch for two keys", () => {
      const tree = buildBalancedTree(["s1", "s2"]);
      expect(tree.kind).toBe("branch");
      const leaves = allLeaves(tree);
      expect(leaves).toHaveLength(2);
      expect(leaves.map((l) => l.threadId)).toEqual(["s1", "s2"]);
    });

    it("creates balanced structure for four keys", () => {
      const tree = buildBalancedTree(["s1", "s2", "s3", "s4"]);
      const leaves = allLeaves(tree);
      expect(leaves).toHaveLength(4);
      expect(leaves.map((l) => l.threadId)).toEqual(["s1", "s2", "s3", "s4"]);
    });
  });

  describe("serializeLayout / deserializeLayout", () => {
    it("round-trips a single leaf layout", () => {
      const layout: SplitPaneLayout = {
        root: createLeaf("t1", "p1"),
        focusedPaneId: "p1",
      };
      const json = serializeLayout(layout);
      const restored = deserializeLayout(json);
      expect(restored).not.toBeNull();
      expect(restored!.focusedPaneId).toBe("p1");
      expect(restored!.root.kind).toBe("leaf");
      expect((restored!.root as ReturnType<typeof createLeaf>).threadId).toBe("t1");
    });

    it("round-trips a branched layout", () => {
      const root = splitLeaf(createLeaf("t1", "p1"), "p1", "vertical", "t2");
      const layout: SplitPaneLayout = { root, focusedPaneId: "p1" };
      const json = serializeLayout(layout);
      const restored = deserializeLayout(json);
      expect(restored).not.toBeNull();
      const leaves = allLeaves(restored!.root);
      expect(leaves).toHaveLength(2);
      expect(leaves.map((l) => l.threadId)).toEqual(["t1", "t2"]);
    });

    it("returns null for invalid JSON", () => {
      expect(deserializeLayout("not-json")).toBeNull();
    });

    it("returns null for empty object", () => {
      expect(deserializeLayout("{}")).toBeNull();
    });
  });
});

import { describe, expect, test } from "vitest";
import { applyModification } from "../../../../src/modules/chat/services/modification-ops.js";

const active = [1, 2, 3, 4, 5, 6].map((p) => ({
  position: p,
  destinationId: `d${p}`,
  name: `Place ${p}`,
  category: p % 2 === 1 ? "Pantai" : "Budaya",
}));

const replacement = { destinationId: "n1", name: "New Place", category: "Budaya" };

describe("applyModification", () => {
  test("replace keeps the count and every other row", () => {
    const out = applyModification(active, { operation: "replace_destination", targetPosition: 4 }, [replacement]);
    expect(out.stops).toHaveLength(6);
    expect(out.stops[3]!.destinationId).toBe("n1");
    expect(out.stops[3]!.position).toBe(4);
    expect(out.stops[0]!.destinationId).toBe("d1");
    expect(out.excludedIds).toEqual(["d4"]);
  });

  test("replace by name targets the matching row", () => {
    const out = applyModification(active, { operation: "replace_destination", targetName: "Place 2" }, [replacement]);
    expect(out.stops[1]!.destinationId).toBe("n1");
  });

  test("replace keeps the prior category when the candidate has none", () => {
    const out = applyModification(
      active,
      { operation: "replace_destination", targetPosition: 1 },
      [{ destinationId: "n2", name: "No Category" }],
    );
    expect(out.stops[0]!.category).toBe("Pantai");
  });

  test("remove drops one row and renumbers positions", () => {
    const out = applyModification(active, { operation: "remove_destination", targetPosition: 4 }, []);
    expect(out.stops).toHaveLength(5);
    expect(out.stops.map((s) => s.position)).toEqual([1, 2, 3, 4, 5]);
    expect(out.excludedIds).toEqual(["d4"]);
  });

  test("remove with targetLast drops the last row", () => {
    const out = applyModification(active, { operation: "remove_destination", targetLast: true }, []);
    expect(out.stops.map((s) => s.destinationId)).toEqual(["d1", "d2", "d3", "d4", "d5"]);
  });

  test("add appends new rows and skips ids already present", () => {
    const out = applyModification(active, { operation: "add_destination", quantity: 2 }, [
      { destinationId: "d1", name: "Duplicate" },
      { destinationId: "n9", name: "Added", category: "Pantai" },
      { destinationId: "n10", name: "Also Added" },
    ]);
    expect(out.stops).toHaveLength(8);
    expect(out.stops.slice(6).map((s) => s.destinationId)).toEqual(["n9", "n10"]);
  });

  test("out-of-range position is a 422", () => {
    expect(() =>
      applyModification(active, { operation: "replace_destination", targetPosition: 9 }, [replacement]),
    ).toThrowError(expect.objectContaining({ status: 422 }));
  });

  test("unknown name is a 422", () => {
    expect(() =>
      applyModification(active, { operation: "remove_destination", targetName: "Nowhere" }, []),
    ).toThrowError(expect.objectContaining({ status: 422 }));
  });
});

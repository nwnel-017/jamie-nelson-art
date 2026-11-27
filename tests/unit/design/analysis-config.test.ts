import { describe, expect, test } from "vitest";
import { analysisLimit } from "../../../server/utils/agent/analysis-config";

describe("analysis attempt limit", () => {
  test.each([0, -1, "bad"])("rejects invalid limit %s", (limit) => {
    expect(() => analysisLimit(limit)).toThrow(
      expect.objectContaining({ statusCode: 503 }),
    );
  });
});

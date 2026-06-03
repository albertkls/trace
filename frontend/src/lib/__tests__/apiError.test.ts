import { describe, it, expect } from "vitest";
import {
  classifyApiError,
  getErrorMessage,
  isRetryable,
  isApiError,
} from "@/lib/apiError";

function mockResponse(status: number, ok: boolean, statusText = ""): Response {
  return {
    status,
    ok,
    statusText: statusText || String(status),
  } as unknown as Response;
}

describe("classifyApiError", () => {
  it("returns unauthorized for 401", () => {
    const result = classifyApiError(mockResponse(401, false));
    expect(result.kind).toBe("unauthorized");
    expect(result.status).toBe(401);
  });

  it("returns unauthorized for 403", () => {
    const result = classifyApiError(mockResponse(403, false));
    expect(result.kind).toBe("unauthorized");
    expect(result.status).toBe(403);
  });

  it("returns rate_limit for 429", () => {
    const result = classifyApiError(mockResponse(429, false));
    expect(result.kind).toBe("rate_limit");
    expect(result.status).toBe(429);
  });

  it("returns validation for 400", () => {
    const result = classifyApiError(mockResponse(400, false));
    expect(result.kind).toBe("validation");
    expect(result.status).toBe(400);
  });

  it("returns not_found for 404", () => {
    const result = classifyApiError(mockResponse(404, false));
    expect(result.kind).toBe("not_found");
    expect(result.status).toBe(404);
  });

  it("returns server for 500", () => {
    const result = classifyApiError(mockResponse(500, false));
    expect(result.kind).toBe("server");
    expect(result.status).toBe(500);
  });

  it("returns server for 502", () => {
    const result = classifyApiError(mockResponse(502, false));
    expect(result.kind).toBe("server");
    expect(result.status).toBe(502);
  });

  it("returns server for 503", () => {
    const result = classifyApiError(mockResponse(503, false));
    expect(result.kind).toBe("server");
    expect(result.status).toBe(503);
  });

  it("returns unknown for 200 (unexpected)", () => {
    const result = classifyApiError(mockResponse(200, true));
    expect(result.kind).toBe("unknown");
    expect(result.status).toBe(200);
  });
});

describe("getErrorMessage", () => {
  it("returns unauthorized message", () => {
    const error = classifyApiError(mockResponse(401, false));
    expect(getErrorMessage(error)).toBe("无权限操作，请检查设置");
  });

  it("returns rate_limit message", () => {
    const error = classifyApiError(mockResponse(429, false));
    expect(getErrorMessage(error)).toBe("请求过于频繁，请稍后再试");
  });

  it("returns validation message", () => {
    const error = classifyApiError(mockResponse(400, false));
    expect(getErrorMessage(error)).toBe("输入数据无效");
  });

  it("returns not_found message", () => {
    const error = classifyApiError(mockResponse(404, false));
    expect(getErrorMessage(error)).toBe("请求的资源不存在");
  });

  it("returns server message", () => {
    const error = classifyApiError(mockResponse(500, false));
    expect(getErrorMessage(error)).toBe("服务器错误，请稍后再试");
  });

  it("returns network message for network kind", () => {
    const error = Object.assign(new Error("fetch failed"), {
      kind: "network",
      status: 0,
    });
    expect(getErrorMessage(error)).toBe("网络连接失败，请检查网络");
  });

  it("falls back to error message for unknown kind", () => {
    const error = Object.assign(new Error("操作失败"), {
      kind: "unknown",
      status: 0,
    });
    expect(getErrorMessage(error)).toBe("操作失败");
  });

  it("detects network error from message", () => {
    const error = new Error("network is down");
    expect(getErrorMessage(error)).toBe("网络连接失败，请检查网络");
  });

  it("falls back to generic message for plain errors", () => {
    const error = new Error("something went wrong");
    expect(getErrorMessage(error)).toBe("something went wrong");
  });

  it("falls back to generic string for non-Error", () => {
    expect(getErrorMessage("oops")).toBe("操作失败");
  });
});

describe("isRetryable", () => {
  it("returns true for server error", () => {
    const error = classifyApiError(mockResponse(500, false));
    expect(isRetryable(error)).toBe(true);
  });

  it("returns true for network kind", () => {
    const error = Object.assign(new Error("fetch failed"), {
      kind: "network",
      status: 0,
    });
    expect(isRetryable(error)).toBe(true);
  });

  it("returns true for rate_limit", () => {
    const error = classifyApiError(mockResponse(429, false));
    expect(isRetryable(error)).toBe(true);
  });

  it("returns false for validation", () => {
    const error = classifyApiError(mockResponse(400, false));
    expect(isRetryable(error)).toBe(false);
  });

  it("returns false for not_found", () => {
    const error = classifyApiError(mockResponse(404, false));
    expect(isRetryable(error)).toBe(false);
  });

  it("returns false for unauthorized", () => {
    const error = classifyApiError(mockResponse(401, false));
    expect(isRetryable(error)).toBe(false);
  });

  it("returns false for unknown kind", () => {
    const error = Object.assign(new Error("boom"), {
      kind: "unknown",
      status: 0,
    });
    expect(isRetryable(error)).toBe(false);
  });
});

describe("isApiError type guard", () => {
  it("returns true for a valid ApiError object", () => {
    const error = classifyApiError(mockResponse(400, false));
    expect(isApiError(error)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isApiError(null)).toBe(false);
  });

  it("returns false for a plain Error", () => {
    expect(isApiError(new Error("oops"))).toBe(false);
  });

  it("returns false for an object missing kind", () => {
    expect(isApiError({ status: 400 })).toBe(false);
  });

  it("returns false for an object missing status", () => {
    expect(isApiError({ kind: "network" })).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isApiError("not an error")).toBe(false);
  });
});

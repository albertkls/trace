export type ApiErrorKind = "unauthorized" | "rate_limit" | "server" | "network" | "validation" | "not_found" | "unknown";

export interface ApiError extends Error {
  kind: ApiErrorKind;
  status: number;
  body?: unknown;
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "status" in error
  );
}

export function classifyApiError(response: Response, body?: unknown): ApiError {
  const status = response.status;
  let kind: ApiErrorKind;

  switch (status) {
    case 401:
    case 403:
      kind = "unauthorized";
      break;
    case 429:
      kind = "rate_limit";
      break;
    case 400:
      kind = "validation";
      break;
    case 404:
      kind = "not_found";
      break;
    case 500:
    case 502:
    case 503:
      kind = "server";
      break;
    default:
      kind = response.ok ? "unknown" : "server";
  }

  return Object.assign(new Error(response.statusText), {
    kind,
    status,
    body,
  });
}

export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    switch (error.kind) {
      case "unauthorized":
        return "无权限操作，请检查设置";
      case "rate_limit":
        return "请求过于频繁，请稍后再试";
      case "validation":
        return error.body ? String(error.body) : "输入数据无效";
      case "not_found":
        return "请求的资源不存在";
      case "server":
        return "服务器错误，请稍后再试";
      case "network":
        return "网络连接失败，请检查网络";
      default:
        return error.message || "操作失败";
    }
  }

  if (error instanceof Error) {
    if (error.message.includes("fetch") || error.message.includes("network")) {
      return "网络连接失败，请检查网络";
    }
    return error.message;
  }

  return "操作失败";
}

export function isRetryable(error: unknown): boolean {
  if (isApiError(error)) {
    return error.kind === "server" || error.kind === "network" || error.kind === "rate_limit";
  }
  return false;
}

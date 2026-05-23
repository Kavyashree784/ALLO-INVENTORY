import { ZodError } from "zod";

import { isHttpError } from "@/lib/errors";

type SuccessResponse<T> = {
  success: true;
  data: T;
};

export function success<T>(data: T, init?: ResponseInit) {
  return Response.json({ success: true, data } satisfies SuccessResponse<T>, init);
}

export function failure(message: string, status = 500, code = "INTERNAL_SERVER_ERROR", issues?: unknown) {
  return Response.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(issues ? { issues } : {}),
      },
    },
    { status }
  );
}

export function toApiError(error: unknown) {
  if (error instanceof SyntaxError) {
    return failure("Malformed request body", 400, "MALFORMED_JSON");
  }

  if (error instanceof ZodError) {
    return failure("Invalid request body", 400, "VALIDATION_ERROR", error.flatten());
  }

  if (isHttpError(error)) {
    return failure(error.message, error.status, error.code);
  }

  return failure("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
}
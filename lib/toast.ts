import { toast as sonner, type ExternalToast } from "sonner";

export type ToastId = string | number;

export const toast = sonner;

type PendingArgs = {
  loading: string;
  success: string | ((value: unknown) => string);
  error?: string | ((err: unknown) => string);
  description?: ExternalToast["description"];
};

/**
 * Wrap a promise with a single toast that flips loading → success/error.
 * Returns the underlying promise so callers can await it.
 */
export function toastPromise<T>(
  promise: Promise<T>,
  { loading, success, error, description }: PendingArgs,
): Promise<T> {
  sonner.promise(promise, {
    loading,
    success: (value) => ({
      message: typeof success === "function" ? success(value) : success,
      description,
    }),
    error: (err) => ({
      message:
        typeof error === "function"
          ? error(err)
          : error ?? formatError(err),
    }),
  });
  return promise;
}

export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

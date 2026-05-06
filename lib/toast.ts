import { toast as sonner, type ExternalToast } from "sonner";

import { formatCloakError, type UiError } from "@/lib/cloak/errors";

export type ToastId = string | number;

export const toast = sonner;

/**
 * Show a single toast for a Cloak error: title from the mapped category,
 * description combines message + optional suggestion. Pass an existing
 * `toastId` to convert a `loading` toast into the error in place.
 */
export function toastCloakError(
  toastIdOrError: ToastId | unknown,
  err?: unknown,
): UiError {
  const ui =
    err === undefined
      ? formatCloakError(toastIdOrError)
      : formatCloakError(err);
  const id =
    err === undefined ? undefined : (toastIdOrError as ToastId);
  const description = ui.suggestion
    ? `${ui.message} ${ui.suggestion}`
    : ui.message;
  sonner.error(ui.title, id !== undefined ? { id, description } : { description });
  return ui;
}

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

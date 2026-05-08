import { toast as sonner, type ExternalToast } from "sonner";

import { isAnyTourActive } from "@/lib/cloak/tour";
import { formatCloakError, type UiError } from "@/lib/cloak/errors";

export type ToastId = string | number;

/**
 * Tour-aware toast facade. While a guided tour is active we silence every
 * toast variant so they don't compete visually with the spotlight overlay.
 * Calls still resolve to a sentinel id (so callers that pipe the return
 * value into another toast call don't crash), and toast.dismiss / promise
 * keep working, the ExternalToast UI is just never rendered during the
 * tour.
 *
 * Implemented as a Proxy over the underlying sonner singleton so every
 * method (`toast()`, `toast.success`, `toast.error`, `toast.loading`,
 * `toast.promise`, `toast.dismiss`, custom JSX, etc.) gets the same gating
 * automatically.
 */
const SUPPRESSED: ToastId = -1;

function gate<T extends (...args: never[]) => unknown>(fn: T): T {
  return ((...args: Parameters<T>): ReturnType<T> | ToastId => {
    if (isAnyTourActive()) return SUPPRESSED;
    return fn(...args) as ReturnType<T>;
  }) as T;
}

export const toast: typeof sonner = new Proxy(sonner, {
  apply(target, thisArg, argArray: Parameters<typeof sonner>) {
    if (isAnyTourActive()) return SUPPRESSED;
    return Reflect.apply(target, thisArg, argArray);
  },
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value !== "function") return value;
    // `dismiss` should never be silenced, if a toast is somehow on screen
    // (e.g. fired before the tour started), callers must still be able to
    // close it.
    if (prop === "dismiss") return value.bind(target);
    return gate(value.bind(target) as (...args: never[]) => unknown);
  },
}) as typeof sonner;

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
  if (isAnyTourActive()) return ui;
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
 * Returns the underlying promise so callers can await it. While a tour is
 * active the promise still runs, but no toast is shown, the spotlight +
 * step transitions carry the visual feedback instead.
 */
export function toastPromise<T>(
  promise: Promise<T>,
  { loading, success, error, description }: PendingArgs,
): Promise<T> {
  if (isAnyTourActive()) return promise;
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

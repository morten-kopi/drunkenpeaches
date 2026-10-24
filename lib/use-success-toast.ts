import { useEffect, useEffectEvent, useRef } from "react";
import { toast } from "sonner";

/**
 * Fires a success toast when a `useActionState` action completes without error
 * (i.e. `pending` falls true → false and no `error` came back). Lets us add
 * consistent success feedback to forms that revalidate-in-place — without
 * touching the server actions (which is a plan non-goal).
 */
export function useSuccessToast(
  pending: boolean,
  error: string | undefined,
  message: string,
  /** Also run after a success, e.g. to close the form. */
  onSuccess?: () => void
) {
  const wasPending = useRef(false);
  const afterSuccess = useEffectEvent(() => onSuccess?.());
  useEffect(() => {
    if (wasPending.current && !pending && !error) {
      toast.success(message);
      afterSuccess();
    }
    wasPending.current = pending;
  }, [pending, error, message]);
}

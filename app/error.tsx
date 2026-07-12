"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle } from "lucide-react";

/**
 * Route-level error boundary.
 *
 * Catches errors thrown during rendering of any route under the root layout
 * (e.g. the "removeChild" NotFoundError caused by browser extensions modifying
 * React-managed DOM nodes). Unlike the global-error boundary, this one keeps
 * the surrounding layout (sidebar, navigation) intact and only replaces the
 * errored page content.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="flex items-center gap-3 text-muted-foreground">
        <AlertCircle className="h-5 w-5" />
        <span>Something went wrong while loading this page.</span>
      </div>
      <p className="text-sm text-muted-foreground max-w-md text-center">
        This can happen when a browser extension modifies the page. Try again —
        if the problem persists, disabling extensions on this site may help.
      </p>
      <Button onClick={reset} variant="outline" size="sm">
        <RefreshCw className="h-4 w-4 mr-2" />
        Try again
      </Button>
    </div>
  );
}

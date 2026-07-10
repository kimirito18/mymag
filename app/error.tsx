"use client";

import { UnexpectedErrorPage } from "./components/error-display";

export default function Error({
  reset
}: {
  error: Error & { digest?: string };
  reset: ()=>void;
}) {
  return <UnexpectedErrorPage reset={reset} />;
}

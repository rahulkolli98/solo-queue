"use client";

import { useQuery } from "convex/react";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import type { OptionalRestArgsOrSkip } from "convex/react";
import { useState } from "react";

/**
 * `useQuery` that keeps showing the previous result while the arguments change.
 * Screens pass a `now` argument that ticks every minute; plain `useQuery`
 * returns `undefined` for each new argument until the answer arrives, which
 * would flash a skeleton (and unmount any form on the page) once a minute.
 * It is still `undefined` the very first time, while nothing has loaded.
 */
export function useStableQuery<Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): FunctionReturnType<Query> | undefined {
  const result = useQuery(query, ...args);
  const [stored, setStored] = useState(result);
  if (result !== undefined && result !== stored) setStored(result);
  return result === undefined ? stored : result;
}

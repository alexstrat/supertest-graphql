import { ExecutionResult } from "graphql";

export type Variables = { [key: string]: unknown };

export type AssertFn<TData> = (
  result: ExecutionResult<TData>
) => Error | undefined | Promise<Error | undefined>;

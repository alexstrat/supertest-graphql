import { DocumentNode, GraphQLError, OperationDefinitionNode } from "graphql";
import { AssertFn } from "./types";

export const getOperationName = (
  document: DocumentNode
): string | undefined => {
  let operationName = undefined;

  const operationDefinitions = document.definitions.filter(
    (definition) => definition.kind === "OperationDefinition"
  ) as OperationDefinitionNode[];

  if (operationDefinitions.length === 1) {
    operationName = operationDefinitions[0].name?.value;
  }
  return operationName;
};

type Pop<TItem> = {
  resolve: (item: TItem | PromiseLike<TItem>) => void;
  tm: NodeJS.Timeout | null;
};

// inspired from https://github.com/davidje13/superwstest/blob/main/src/BlockingQueue.mjs
export class BlockingQueue<TItem> {
  private pendingPush: TItem[] = [];
  private pendingPop: Pop<TItem>[] = [];

  push(item: TItem): void {
    if (this.pendingPop.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- it's verified with above condition
      const firstPendingPop = this.pendingPop.shift()!;
      if (typeof firstPendingPop.tm === "number") {
        clearTimeout(firstPendingPop.tm);
      }
      firstPendingPop.resolve(item);
    } else {
      this.pendingPush.push(item);
    }
  }

  async pop(timeout?: number): Promise<TItem> {
    if (this.pendingPush.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- it's verified with above condition
      return this.pendingPush.shift()!;
    }
    return new Promise((resolve, reject) => {
      const newPop: Pop<TItem> = { resolve, tm: null };
      this.pendingPop.push(newPop);
      if (timeout !== undefined) {
        newPop.tm = setTimeout(() => {
          this.pendingPop = this.pendingPop.filter((pop) => pop !== newPop);
          reject(new Error(`Timeout after ${timeout}ms`));
        }, timeout);
      }
    });
  }

  flush(): TItem[] {
    const flushed = [...this.pendingPush];
    this.pendingPush = [];
    return flushed;
  }

  get length(): number {
    return this.pendingPush.length;
  }
}

/**
 * Wraps an assert function into another.
 * The wrapper function edit the stack trace of any assertion error, prepending a more useful stack to it.
 *
 * Borrowed from supertest
 */
export function wrapAssertFn<TData>(
  assertFn: AssertFn<TData>
): AssertFn<TData> {
  const savedStack = new Error().stack?.split("\n").slice(3) || [];

  return async (res) => {
    let badStack;
    const err = await assertFn(res);
    if (err instanceof Error && err.stack) {
      badStack = err.stack.replace(err.message, "").split("\n").slice(1);
      err.stack = [err.toString()]
        .concat(savedStack)
        .concat("----")
        .concat(badStack)
        .join("\n");
    }
    return err;
  };
}

export const asserNoError: AssertFn<unknown> = ({ errors }) => {
  if (errors && Array.isArray(errors) && errors.length > 0) {
    const errorSummary = (errors as GraphQLError[])
      .map((e) => e.message)
      .join(",");
    return new Error(
      `expected no errors but got ${errors.length} error(s) in GraphQL response: ${errorSummary}`
    );
  }
};

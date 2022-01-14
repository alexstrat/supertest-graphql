import { DocumentNode, OperationDefinitionNode } from "graphql";

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
}

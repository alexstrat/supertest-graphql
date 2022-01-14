import { DocumentNode, ExecutionResult, print } from "graphql";
import { ObjMap } from "graphql/jsutils/ObjMap";
import { Observable, SubscriptionClient } from "subscriptions-transport-ws";
import ws from "ws";

import { Variables } from "./types";
import { BlockingQueue, getOperationName } from "./utils";

class SuperTestExecutionNextResult<TData>
  implements PromiseLike<ExecutionResult<TData>>
{
  constructor(private pop: Promise<ExecutionResult<TData>>) {}
  async then<
    TResult1 = ExecutionResult<TData, ObjMap<unknown>>,
    TResult2 = never
  >(
    onfulfilled?:
      | ((
          value: ExecutionResult<TData, ObjMap<unknown>>
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const res = await this.pop;
    if (onfulfilled) return onfulfilled(res);
    // @ts-expect-error no idea why
    return res;
  }
  // expectNoErrors(): this;
}

class SuperTestExecutionStreamingResult<TData> {
  private queue: BlockingQueue<ExecutionResult<TData>> = new BlockingQueue();

  constructor(
    private client: SubscriptionClient,
    private observable: Observable<ExecutionResult<TData>>
  ) {
    this.observable.subscribe({
      next: (res) => this.queue.push(res),
      complete: () => {
        // do something
      },
      error: () => {
        // do something
      },
    });
  }
  next(): SuperTestExecutionNextResult<TData> {
    return new SuperTestExecutionNextResult(this.queue.pop());
  }
  flush(): ExecutionResult<TData>[] {
    return this.queue.flush();
  }
  // expectNoPending(): Promise<void>;

  async close(): Promise<void> {
    this.client.close();
  }
}

export default class SuperTestWSGraphQL<TData, TVariables extends Variables>
  implements PromiseLike<SuperTestExecutionStreamingResult<TData>>
{
  private _query?: string;
  private _operationName?: string;
  private _variables?: TVariables;

  constructor(private _wsURL: string) {}

  subscribe(operation: DocumentNode | string, variables?: TVariables): this {
    if (typeof operation !== "string") {
      this._operationName = getOperationName(operation);
    }
    this._query = typeof operation === "string" ? operation : print(operation);
    this._variables = variables;
    return this;
  }

  async then<
    TResult1 = SuperTestExecutionStreamingResult<TData>,
    TResult2 = never
  >(
    onfulfilled?:
      | ((
          value: SuperTestExecutionStreamingResult<TData>
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const client = await new Promise<SubscriptionClient>((res, reject) => {
        const client = new SubscriptionClient(
          this._wsURL,
          {
            // todo
            connectionParams: {},
            connectionCallback: (error) => {
              if (error) return reject(error);
              res(client);
            },
          },
          ws
        );
      });

      const observable = client.request({
        query: this._query,
        variables: this._variables,
        operationName: this._operationName,
      });

      const streamingResult = new SuperTestExecutionStreamingResult(
        client,
        observable as unknown as Observable<ExecutionResult<TData>>
      );

      if (onfulfilled) return onfulfilled(streamingResult);
      // @ts-expect-error no idea why
      return streamingResult;
    } catch (e) {
      if (onrejected) return onrejected(e);
      throw new Error("No rejection");
    }
  }
}

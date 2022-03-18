import delay from "delay";
import { DocumentNode, ExecutionResult, print } from "graphql";
import { Client, createClient, Disposable } from "graphql-ws";
import { ObjMap } from "graphql/jsutils/ObjMap";
import { SubscriptionClient } from "subscriptions-transport-ws";
import ws from "ws";
import { Observable, Observer } from "zen-observable-ts";

import { AssertFn, Variables } from "./types";
import {
  asserNoError,
  BlockingQueue,
  getOperationName,
  wrapAssertFn,
} from "./utils";

// /!\ graphql-ws is the legacy one
export type WebSocketProtocol = "graphql-transport-ws" | "graphql-ws";

/**
 * The protocol implemented by the library `subscriptions-transport-ws` and
 * that is now considered legacy.
 */
export const LEGACY_WEBSOCKET_PROTOCOL = "graphql-ws";

export class SuperTestExecutionNextResult<TData>
  implements PromiseLike<ExecutionResult<TData>>
{
  private _asserts: AssertFn<TData>[] = [];

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
    await this.assert(res);
    if (onfulfilled) return onfulfilled(res);
    // @ts-expect-error no idea why
    return res;
  }

  /**
   * Assert that there is no errors (`.errors` field) in response returned from the GraphQL API.
   */
  expectNoErrors(): this {
    this._asserts.push(wrapAssertFn(asserNoError));
    return this;
  }

  private async assert(result: ExecutionResult<TData>): Promise<void> {
    for (const assertFn of this._asserts) {
      const maybeError = await assertFn(result);
      if (maybeError instanceof Error) throw maybeError;
    }
  }
}

export class SuperTestExecutionStreamingResult<TData> {
  private queue: BlockingQueue<ExecutionResult<TData>> = new BlockingQueue();

  constructor(
    private client: Disposable,
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

  subscribe(observer: Observer<ExecutionResult<TData>>): {
    unsubscribe: () => void;
  } {
    return this.observable.subscribe(observer);
  }

  /**
   * Get the next result that the operation is emitting.
   */
  next(): SuperTestExecutionNextResult<TData> {
    return new SuperTestExecutionNextResult(this.queue.pop());
  }

  /**
   * Flush the pending results from the queue.
   */
  flush(): ExecutionResult<TData>[] {
    return this.queue.flush();
  }

  /**
   * Assert that no more results are pending.
   */
  expectNoPending(): this {
    if (this.queue.length > 0) {
      throw new Error(`expect no pending, but got ${this.queue.length}`);
    }
    return this;
  }

  /**
   * Close the operation and the connection.
   */
  async close(): Promise<void> {
    await this.client.dispose();
  }
}

export class SuperTestExecutionStreamingResultPool {
  private _subscriptions: SuperTestExecutionStreamingResult<any>[] = [];
  async endAll(): Promise<void> {
    await Promise.all(this._subscriptions.map((c) => c.close()));
    this._subscriptions = [];
  }
  add(sub: SuperTestExecutionStreamingResult<any>): void {
    this._subscriptions.push(sub);
  }
}

type ConnectionParams = {
  [paramName: string]: any;
};
export default class SuperTestWSGraphQL<TData, TVariables extends Variables>
  implements PromiseLike<SuperTestExecutionStreamingResult<TData>>
{
  private _query?: string;
  private _operationName?: string;
  private _variables?: TVariables;
  private _path = "/graphql";
  private _protocol: WebSocketProtocol = "graphql-transport-ws";
  private _connectionParams?: ConnectionParams;

  constructor(
    private _hostname: string,
    private _pool?: SuperTestExecutionStreamingResultPool
  ) {}

  /**
   *  Send a GraphQL Query Document to the GraphQL server for execution.
   * @param operation - the query to execute as string or `DocumentNode`
   * @param variables - the variables for this query
   */
  subscribe(operation: DocumentNode | string, variables?: TVariables): this {
    this.operation(operation, variables);
    return this;
  }

  /**
   * Send a GraphQL Query Document to the GraphQL server for execution.
   * @param query - the query to execute as string or `DocumentNode`
   * @param variables - the variables for this query
   */
  query(query: DocumentNode | string, variables?: TVariables): this {
    return this.operation(query, variables);
  }

  /**
   * Send a GraphQL Query Document to the GraphQL server for execution.
   * @param mutation - the mutation to execute as string or `DocumentNode`
   * @param variables - the variables for this mutation
   */
  mutate(mutation: DocumentNode | string, variables?: TVariables): this {
    return this.operation(mutation, variables);
  }

  /**
   * Send a GraphQL Query Document to the GraphQL server for execution.
   * @param operation - the operation to execute as string or `DocumentNode`
   * @param variables - the variables for this operation
   */
  operation(operation: DocumentNode | string, variables?: TVariables): this {
    if (typeof operation !== "string") {
      this._operationName = getOperationName(operation);
    }
    this._query = typeof operation === "string" ? operation : print(operation);
    this._variables = variables;
    return this;
  }

  /**
   * Set variables.
   * @param - variables
   */
  variables(variables: TVariables): this {
    this._variables = variables;
    return this;
  }

  /**
   * Set the GraphQL endpoint path.
   *
   * @default "/graphql"
   */
  path(path: string): this {
    this._path = path;
    return this;
  }

  /**
   * Set the GraphQL WebSocket porotocol.
   * You can set the legacy protocol with the variable `LEGACY_WEBSOCKET_PROTOCOL`.
   */
  protocol(wsProtocol: WebSocketProtocol): this {
    this._protocol = wsProtocol;
    return this;
  }

  /**
   * Set connection params.
   */
  connectionParams(params: ConnectionParams): this {
    this._connectionParams = params;
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
      const url = new URL(this._path, this._hostname).toString();
      const run =
        this._protocol === "graphql-ws"
          ? runSubscriptionLegacy
          : runSubscription;

      if (!this._query) throw new Error("Missing a query");
      const [observable, disposable] = await run<TData, TVariables>({
        url,
        connectionParams: this._connectionParams,
        query: this._query,
        variables: this._variables,
        operationName: this._operationName,
      });

      const streamingResult = new SuperTestExecutionStreamingResult(
        disposable,
        observable
      );

      this._pool?.add(streamingResult);

      if (onfulfilled) return onfulfilled(streamingResult);
      // @ts-expect-error no idea why
      return streamingResult;
    } catch (e) {
      if (onrejected) return onrejected(e);
      throw new Error("No rejection");
    }
  }
}

type SubscriptionRunArgs<TVariables> = {
  url: string;
  connectionParams?: ConnectionParams;
  query: string;
  variables?: TVariables;
  operationName?: string;
};

const runSubscriptionLegacy = async <TData, TVariables extends Variables>({
  url,
  query,
  connectionParams,
  variables,
  operationName,
}: SubscriptionRunArgs<TVariables>): Promise<
  [Observable<ExecutionResult<TData>>, Disposable]
> => {
  const client = await new Promise<SubscriptionClient>((res, reject) => {
    const client = new SubscriptionClient(
      url,
      {
        connectionParams,
        connectionCallback: (error) => {
          if (error) {
            client.close();
            return reject(error);
          }
          res(client);
        },
      },
      ws
    );
  });

  const observable = client.request({
    query: query,
    variables: variables,
    operationName: operationName,
  });
  const disposable = {
    dispose: () => client.close(),
  };

  return [
    observable as unknown as Observable<ExecutionResult<TData>>,
    disposable,
  ];
};

const runSubscription = async <TData, TVariables extends Variables>({
  url,
  query,
  connectionParams,
  variables,
  operationName,
}: SubscriptionRunArgs<TVariables>): Promise<
  [Observable<ExecutionResult<TData>>, Disposable]
> => {
  const client = await new Promise<Client>((res, reject) => {
    const client = createClient({
      url,
      connectionParams,
      lazy: false,
      onNonLazyError: (error) => reject(error),
      webSocketImpl: ws,
    });
    client.on("connected", () => res(client));
  });

  const observable = new Observable<ExecutionResult<TData>>((observer) => {
    client.subscribe<TData>(
      {
        query,
        variables,
        operationName,
      },
      observer
    );
  });

  const disposable = {
    dispose: async () => {
      await client.dispose();
      // dispose rely on emiter to close subsctiptions
      await delay(5);
    },
  };
  return [observable, disposable];
};

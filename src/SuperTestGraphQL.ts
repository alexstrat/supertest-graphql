import { DocumentNode, ExecutionResult, GraphQLError, print } from "graphql";
import { SuperAgentTest, Response } from "supertest";

import { getOperationName } from "./utils";

export type Variables = { [key: string]: unknown };

type SuperTestExecutionResult<TData> = ExecutionResult<TData> & {
  response: Response;
};

type AssertFn<TData> = (
  result: SuperTestExecutionResult<TData>
) => Error | undefined | Promise<Error | undefined>;

export default class SuperTestGraphQL<TData, TVariables extends Variables>
  implements PromiseLike<SuperTestExecutionResult<TData>>
{
  private _query?: string;
  private _operationName?: string;
  private _variables?: TVariables;
  private _path: string;
  private _asserts: AssertFn<TData>[];

  constructor(private _supertest: SuperAgentTest) {
    this._path = "/graphql";
    this._asserts = [];
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
    return this.query(mutation, variables);
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
   * Set authentication parameters for the request.
   *
   * @see [supragent.auth](https://visionmedia.github.io/superagent/#authentication)
   */
  auth(user: string, pass: string, options?: { type: "basic" | "auto" }): this;
  auth(token: string, options: { type: "bearer" }): this;
  auth(
    ...args:
      | [string, string]
      | [string, string, { type: "basic" | "auto" }?]
      | [string, { type: "bearer" }]
  ): this {
    this._supertest.auth(...(args as Parameters<SuperAgentTest["auth"]>));
    return this;
  }

  /**
   * Set headers for the request.
   *
   * @see [supragent.set](https://visionmedia.github.io/superagent/#setting-header-fields)
   */
  // can't use Parameters<> because not supported with several overloads
  // https://github.com/microsoft/TypeScript/issues/26591
  set(field: object): this;
  set(field: string, val: string): this;
  set(field: "Cookie", val: string[]): this;
  set(...args: [object] | [string, string] | ["Cookie", string[]]): this {
    this._supertest.set(...(args as Parameters<SuperAgentTest["set"]>));
    return this;
  }

  /**
   * Assert that there is no errors (`.errors` field) in response returned from the GraphQL API.
   */
  expectNoErrors(): this {
    this._asserts.push(
      wrapAssertFn(({ errors }) => {
        if (errors && Array.isArray(errors) && errors.length > 0) {
          const errorSummary = (errors as GraphQLError[])
            .map((e) => e.message)
            .join(",");
          return new Error(
            `expected no errors but got ${errors.length} error(s) in GraphQL response: ${errorSummary}`
          );
        }
      })
    );
    return this;
  }

  /**
   * Access to underlying supertest instance.
   */
  supertest(): SuperAgentTest {
    return this._supertest;
  }

  private async assert(result: SuperTestExecutionResult<TData>): Promise<void> {
    for (const assertFn of this._asserts) {
      const maybeError = await assertFn(result);
      if (maybeError instanceof Error) throw maybeError;
    }
  }

  async end(): Promise<SuperTestExecutionResult<TData>> {
    if (this._query === undefined)
      throw new Error("You should call `query` or `mutate`");

    const payload: RequestPayload<TVariables> = {
      query: this._query,
    };
    if (this._operationName) {
      payload.operationName = this._operationName;
    }
    if (this._variables) {
      payload.variables = this._variables;
    }

    const response = await this._supertest
      .post(this._path)
      .accept("application/json")
      .send(payload);

    if (typeof response.body !== "object") {
      throw new Error(`Received a non valid body ${response.body}`);
    }
    const result = { ...response.body, response };

    await this.assert(result);

    return { ...response.body, response };
  }

  async then<TResult1 = SuperTestExecutionResult<TData>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: SuperTestExecutionResult<TData>
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      if (this._query === undefined)
        throw new Error("You should call `query` or `mutate`");
      const res = await this.end();
      if (onfulfilled) return onfulfilled(res);
      // @ts-expect-error no idea why
      return res;
    } catch (e) {
      if (onrejected) return onrejected(e);
      throw new Error("No rejection");
    }
  }
}

type RequestPayload<TVariables extends Variables = Variables> = {
  query: string;
  operationName?: string;
  variables?: TVariables;
};

/**
 * Wraps an assert function into another.
 * The wrapper function edit the stack trace of any assertion error, prepending a more useful stack to it.
 *
 * Borrowed from supertest
 */
function wrapAssertFn<TData>(assertFn: AssertFn<TData>): AssertFn<TData> {
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

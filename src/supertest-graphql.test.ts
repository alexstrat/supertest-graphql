import { gql, ApolloServer, ExpressContext } from "apollo-server-express";
import express from "express";
import { createServer, Server } from "http";
import { SubscriptionServer } from "subscriptions-transport-ws";
import { execute, subscribe } from "graphql";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { GraphQLFieldResolver } from "graphql";
import { PubSub } from "graphql-subscriptions";
import delay from "delay";

import request, { supertestWs } from "./";

const typeDefs = gql`
  type Query {
    hi(name: String): String!
  }
  type Mutation {
    do: String!
  }
  type Subscription {
    onHi(name: String): String!
  }
`;

type QueryHiResolver = GraphQLFieldResolver<
  never,
  ExpressContext,
  { name?: string },
  string
>;
type MutationDoResolver = GraphQLFieldResolver<
  never,
  ExpressContext,
  never,
  string
>;

let server: Server;
let queryHiResolver: jest.Mock<string, Parameters<QueryHiResolver>>;
let mutationDoResolver: jest.Mock<string, Parameters<MutationDoResolver>>;
const pubsub: PubSub = new PubSub();

type InitServerOptions = {
  graphqlPath?: string;
};

const initTestServer = async ({
  graphqlPath,
}: InitServerOptions = {}): Promise<Server> => {
  const app = express();
  const httpServer = createServer(app);
  queryHiResolver = jest.fn<string, Parameters<QueryHiResolver>>(
    (_, { name = "" }) => `hi ${name}!`
  );
  mutationDoResolver = jest.fn<string, Parameters<MutationDoResolver>>(
    () => "done!"
  );
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers: {
      Query: {
        hi: queryHiResolver,
      },
      Mutation: {
        do: mutationDoResolver,
      },
      Subscription: {
        onHi: {
          subscribe: () => pubsub.asyncIterator(["ON_HI"]),
          resolve: (_, { name }: { name?: string | null }) => {
            return `Hi ${name ? name : "unknown"}`;
          },
        },
      },
    },
  });

  const subscriptionServer = SubscriptionServer.create(
    {
      schema,
      execute,
      subscribe,
    },
    {
      server: httpServer,
    }
  );
  const server = new ApolloServer({
    schema,
    context: (c) => c,
    plugins: [
      {
        async serverWillStart() {
          return {
            async drainServer() {
              subscriptionServer.close();
            },
          };
        },
      },
    ],
  });
  await server.start();
  server.applyMiddleware({ app, path: graphqlPath });
  return httpServer;
};

beforeEach(async () => {
  server = await initTestServer();
});

describe(".query()", () => {
  test("it queries", async () => {
    const { data } = await request<{ hi: string }>(server).query(
      gql`
        query {
          hi
        }
      `
    );
    expect(data?.hi).toBe("hi !");
  });
  describe("with variables", () => {
    test("it queries", async () => {
      const { data } = await request<{ hi: string }>(server).query(
        gql`
          query Greetings($name: String!) {
            hi(name: $name)
          }
        `,
        { name: "Alex" }
      );
      expect(data?.hi).toBe("hi Alex!");
    });
  });
  describe("with errors in return", () => {
    it("should make them available", async () => {
      queryHiResolver.mockImplementation(() => {
        throw new Error("Bad");
      });
      const { errors } = await request<{ hi: string }>(server).query(
        gql`
          query {
            hi
          }
        `
      );
      expect(errors).toBeDefined();
      expect(errors).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(errors![0].message).toEqual("Bad");
    });
  });
});

describe(".mutate()", () => {
  test("it mutates", async () => {
    const { data } = await request<{ do: string }>(server).query(
      gql`
        mutation {
          do
        }
      `
    );
    expect(data?.do).toBe("done!");
  });
});

describe(".variables()", () => {
  test("it queries with variables", async () => {
    const { data } = await request<{ hi: string }>(server)
      .query(
        gql`
          query Greetings($name: String!) {
            hi(name: $name)
          }
        `
      )
      .variables({ name: "Alex" });
    expect(data?.hi).toBe("hi Alex!");
  });
});

describe(".path()", () => {
  it("changes the path to query graphql", async () => {
    server = await initTestServer({
      graphqlPath: "/specialUrl",
    });
    const { data } = await request<{ hi: string }>(server)
      .path("/specialUrl")
      .query(
        gql`
          query Greetings($name: String!) {
            hi(name: $name)
          }
        `
      )
      .variables({ name: "Alex" });
    expect(data?.hi).toBe("hi Alex!");
  });
});

describe(".set()", () => {
  test("it properly set headers", async () => {
    await request<{ hi: string }>(server)
      .set("authorization", "bar")
      .query(
        gql`
          query {
            hi
          }
        `
      );
    expect(queryHiResolver).toHaveBeenCalled();
    const { req } = queryHiResolver.mock.calls[0][2];
    expect(req.headers["authorization"]).toEqual("bar");
  });
});

describe(".auth()", () => {
  test("it properly set basic headers", async () => {
    await request<{ hi: string }>(server)
      .auth("username", "password")
      .query(
        gql`
          query {
            hi
          }
        `
      );
    expect(queryHiResolver).toHaveBeenCalled();
    const { req } = queryHiResolver.mock.calls[0][2];
    expect(req.headers["authorization"]).toEqual(
      "Basic dXNlcm5hbWU6cGFzc3dvcmQ="
    );
  });
});

describe(".expectNoErrors()", () => {
  it("when there is an error it should throw", async () => {
    queryHiResolver.mockImplementation(() => {
      throw new Error("Bad");
    });
    return expect(
      request<{ hi: string }>(server)
        .query(
          gql`
            query {
              hi
            }
          `
        )
        .expectNoErrors()
    ).rejects.toThrow(
      "expected no errors but got 1 error(s) in GraphQL response: Bad"
    );
  });
  it("when there is no error it should not throw", async () => {
    return expect(
      request<{ hi: string }>(server)
        .query(
          gql`
            query {
              hi
            }
          `
        )
        .expectNoErrors()
    ).resolves.not.toThrow();
  });
});

describe("test ws", () => {
  beforeEach((done) => {
    server.listen(0, "localhost", done);
  });

  afterEach((done) => {
    server.close(done);
  });

  it("should work", async () => {
    const sub = await supertestWs(server).subscribe(gql`
      subscription {
        onHi
      }
    `);

    // there is no wayt to know if the subscription is active,
    // to avoid race conditions we need to wait a bit
    await delay(200);

    pubsub.publish("ON_HI", {});
    const res = await sub.next();

    expect(res.data).toEqual({ onHi: "Hi unknown" });

    await sub.close();
  });
});

import { gql, ApolloServer, ExpressContext } from "apollo-server-express";
import express from "express";
import { GraphQLFieldResolver } from "graphql";
import request from "./";

const typeDefs = gql`
  type Query {
    hi(name: String): String!
  }
  type Mutation {
    do: String!
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

let app: express.Application;
let queryHiResolver: jest.Mock<string, Parameters<QueryHiResolver>>;
let mutationDoResolver: jest.Mock<string, Parameters<MutationDoResolver>>;

beforeEach(async () => {
  app = express();
  queryHiResolver = jest.fn<string, Parameters<QueryHiResolver>>(
    (_, { name = "" }) => `hi ${name}!`
  );
  mutationDoResolver = jest.fn<string, Parameters<MutationDoResolver>>(
    () => "done!"
  );
  const server = new ApolloServer({
    typeDefs,
    resolvers: {
      Query: {
        hi: queryHiResolver,
      },
      Mutation: {
        do: mutationDoResolver,
      },
    },
    // pass express context
    context: (c) => c,
  });
  await server.start();
  server.applyMiddleware({ app });
});

describe(".query()", () => {
  test("it queries", async () => {
    const { data } = await request<{ hi: string }>(app).query(
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
      const { data } = await request<{ hi: string }>(app).query(
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
      const { errors } = await request<{ hi: string }>(app).query(
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
    const { data } = await request<{ do: string }>(app).query(
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
    const { data } = await request<{ hi: string }>(app)
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
    app = express();
    const server = new ApolloServer({
      typeDefs,
      resolvers: {
        Query: {
          hi: (_, { name = "" }) => `hi ${name}!`,
        },
        Mutation: {
          do: () => "done!",
        },
      },
    });
    await server.start();
    server.applyMiddleware({ app, path: "/specialUrl" });
    const { data } = await request<{ hi: string }>(app)
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
    await request<{ hi: string }>(app)
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
    await request<{ hi: string }>(app)
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
      request<{ hi: string }>(app)
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
      request<{ hi: string }>(app)
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

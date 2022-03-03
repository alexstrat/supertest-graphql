import * as http from "http";
import * as https from "https";
import { agent } from "supertest";
import SuperTestGraphQL from "./SuperTestGraphQL";
import SuperTestWSGraphQL, {
  SuperTestExecutionStreamingResultPool,
} from "./SuperTestWSGraphQL";
import { Variables } from "./types";

/**
 * Test against the given `app` returnig a new `SuperTestGraphQL`.
 */
const supertest = <TData, TVariables extends Variables = Variables>(
  app: unknown
): SuperTestGraphQL<TData, TVariables> => {
  const supertest = agent(app);
  return new SuperTestGraphQL<TData, TVariables>(supertest);
};

// todo: put me somewhere
function getWSBase(server: https.Server | http.Server) {
  if (typeof server === "string") {
    return server;
  }

  const address = server.address();
  if (!address) {
    // see https://github.com/visionmedia/supertest/issues/566
    throw new Error(
      "Server must be listening:\n" +
        "beforeEach((done) => server.listen(0, 'localhost', done));\n" +
        "afterEach((done) => server.close(done));\n" +
        "\n" +
        "supertest's request(app) syntax is not supported (find out more: https://github.com/davidje13/superwstest#why-isnt-requestapp-supported)"
    );
  }

  const protocol = server instanceof https.Server ? "wss" : "ws";
  let hostname;
  if (typeof address === "object") {
    if (address.family.toLowerCase() === "ipv6") {
      hostname = `[${address.address}]`;
    } else {
      hostname = address.address;
    }
  } else {
    hostname = address;
  }
  // @ts-expect-error fix me
  return `${protocol}://${hostname}:${address.port}`;
}

const mainPool = new SuperTestExecutionStreamingResultPool();

export const supertestWs = Object.assign(
  <TData, TVariables extends Variables = Variables>(
    // todo: accept string
    app: https.Server | http.Server | string
  ): SuperTestWSGraphQL<TData, TVariables> => {
    // todo: prametrize
    const base = typeof app === "string" ? app : getWSBase(app);
    return new SuperTestWSGraphQL<TData, TVariables>(base, mainPool);
  },
  {
    end: () => mainPool.endAll(),
  }
);

export * from "./SuperTestGraphQL";
export * from "./types";
export { SuperTestGraphQL };
export default supertest;

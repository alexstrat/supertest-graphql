import { agent } from "supertest";
import SuperTestGraphQL, { Variables } from "./SuperTestGraphQL";

/**
 * Test against the given `app` returnig a new `SuperTestGraphQL`.
 */
const supertest = <TData, TVariables extends Variables = Variables>(
  app: unknown
): SuperTestGraphQL<TData, TVariables> => {
  const supertest = agent(app);
  return new SuperTestGraphQL<TData, TVariables>(supertest);
};

export * from "./SuperTestGraphQL";
export { SuperTestGraphQL };
export default supertest;

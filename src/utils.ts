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

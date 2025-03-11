import {BlocksType, HaikuImplementedLangs, WorkflowGroup, WorkflowState, WorkflowTransition} from "./HaikuTypes";
import {getArgs, getAttributes, getLabels} from "./haikuAttributes";

export type WorkflowParts = {
      transitions: Record<string, WorkflowTransition>;
      states: Record<string, WorkflowState>;
      groups: Record<string, WorkflowGroup>;
      entitiesUsedInTransitions: Record<string, boolean>;
}

export function getWorkflowParts(block: BlocksType, defaultLanguage: HaikuImplementedLangs): WorkflowParts {
    const states: Record<string,WorkflowState> = {};
    const groups: Record<string,WorkflowGroup> = {}
    const transitions: Record<string,WorkflowTransition> = {};
    const entitiesUsedInTransitions: Record<string, boolean> = {};
    const result = {
        transitions,
        states,
        groups,
        entitiesUsedInTransitions
    };
    if (!block.blocks) {
      return result;
    }
    for (const child of block.blocks) {
      let [fieldType, argPresence, argList] = getAttributes(child.value);
      let labels;
      if (argPresence.labels) {
        labels = getLabels(getArgs("labels", argList), defaultLanguage);
      }
      if (fieldType === "state") {
        states[child.name] = {
          name: child.name,
          labels,
        };
      } else if (fieldType === "group") {
        groups[child.name] = {
          name: child.name,
          labels,
        };
      } else if (fieldType === "transition") {
        const triggerOnServer = argPresence.triggerOnServer;
        let from: WorkflowState = {name: "null"};
        let to: WorkflowState = {name: "null"};
        let group: WorkflowGroup | undefined;
        let entity: string | undefined;
        let clientForm: boolean | undefined;
        if (child.blocks !== undefined) {
          for (const part of child.blocks) {
            if (part.name === "transition" && part.blocks?.length === 2) {
              from = states[part.blocks[0].value.name];
              to = states[part.blocks[1].value.name];
            } else if (part.name === "entity") {
              if (part.value.name) {
                entity = part.value.name;
              } else {
                entity = part.value.args[0].name;
                clientForm = part.value.callee?.name === "clientForm";
              }
              if (entity) {
                entitiesUsedInTransitions[entity] = true;
              }
            } else if (part.name === "group") {
              group = groups[part.value.name];
            }
          }
          transitions[child.name] = {
            name: child.name,
            labels,
            from,
            to,
            triggerOnServer,
            entity,
            clientForm,
            group,
          };
        }
      }
    }
    return result;
  }

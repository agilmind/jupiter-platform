import {BlocksType, EntityPermission, RoleEntityPermissions} from "./HaikuTypes";
import {getAttributes} from "./haikuAttributes";

export type RoleParts = {
      entities: Record<string, RoleEntityPermissions>;
}

export function getRoleParts(block: BlocksType): RoleParts {
    const entities: Record<string, RoleEntityPermissions> = {};
    const result = {
        entities,
    }
    if (!block.blocks) {
        return result;
    }
    for (const child of block.blocks) {
      let [fieldType, argPresence, _argList] = getAttributes(child.value);
      if (fieldType === "entity") {
          entities[child.name] = {
              entityName: child.name,
              permissions: Object.keys(argPresence).map((x: any)=>x as EntityPermission)
          }
      }
    }
    return result;
}

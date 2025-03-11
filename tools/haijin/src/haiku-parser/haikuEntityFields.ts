import * as _ from "lodash";
import {
    BlocksType,
    EntityField,
    EntityGroup,
    HaikuImplementedLangs,
    LangLabelsType,
    mapType,
    MaskType
} from "./HaikuTypes";
import {getArgs, getAttributes, getLabels} from "./haikuAttributes";

export type EntityContent = {
    fields: EntityField[];
    uniqueFields: string[];
    groups: EntityGroup[];
    fieldsByName: Record<string, EntityField>;
    fieldsByType: {[key: string]: EntityField[]};
    reversedFieldNames: Record<string, Record<string, string>>;
    workflows: {workflowName: string, field: EntityField}[];
    entityNames: string[];
}

export function resolveDependentEntity(field: EntityField, resolving: Set<string>) {
    if (!field.solved && field.entityName && field.resolver) {
      if (resolving.has(field.entityName)) {
        return;
      }
      field.resolver(resolving.add(field.entityName));
      field.solved = true;
    }
}

export function getEntityFields(
    block: BlocksType,
    defaultLanguage: HaikuImplementedLangs,
    miniForms: Record<string, {entityName: string}[]>,
    subEntities: Record<string, {entityName: string, fieldName: string}[]>,
    entityOfGroup?: string,
): EntityContent {
    const fields: EntityField[] = [];
    const uniqueFields: string[] = [];
    const groups: EntityGroup[] = [];
    let fieldsByName: Record<string, EntityField> = {};
    let reversedFieldNames: Record<string, Record<string, string>> = {};
    const workflows: {workflowName: string, field: EntityField}[] = [];
    const entityNames: string[] = [];
    let fieldsByType: Record<string, EntityField[]> = {};
    if (!block.blocks) {
      return {
          fields,
          uniqueFields,
          groups,
          fieldsByName,
          fieldsByType,
          reversedFieldNames,
          workflows,
          entityNames,
      };
    }
    let group: EntityGroup;
    let entityName: string;
    if (entityOfGroup) {
      group = {name: block.name, labels: {}, fields: [], looseFields: false, fieldsByName};
      entityName = entityOfGroup;
    } else {
      entityName = block.name;
      group = {name: null, labels: {}, fields: [], looseFields: true, fieldsByName};
      groups.push(group);
      entityNames.push(entityName);
    }
    for (const child of block.blocks) {
      let hideOnApi = false;
      let fieldArgs;
      let [fieldType, argPresence, argList] = getAttributes(child.value);

      if (fieldType === "userPassword") {
        continue;
      }

      let workflowName;
      if (argPresence.workflow) {
        workflowName = fieldType;
        fieldType = `${fieldType}State`;
      }

      if (Array.isArray(fieldType)) {
        fieldArgs = fieldType.slice(1);
        fieldType = fieldType[0];
      }
      if (fieldType.slice(0,8) === "__Fake__") {
        fieldType = fieldType.slice(8);
      }
      if (fieldType === "group") {
        const innerEntityFields =
            getEntityFields(child, defaultLanguage, miniForms, subEntities, entityName);
        const innerFields = innerEntityFields.fields;
        const innerUniques = innerEntityFields.uniqueFields;
        const iGroups = innerEntityFields.groups;
        const iFieldsByName = innerEntityFields.fieldsByName ;
        const iFieldsByType = innerEntityFields.fieldsByType;
        const iReversedRefNames = innerEntityFields.reversedFieldNames;
        entityNames.push(...innerEntityFields.entityNames);
        fields.push(...innerFields);
        uniqueFields.push(...innerUniques);
        fieldsByName = {...fieldsByName, ...iFieldsByName};
        fieldsByType = {...fieldsByType, ...iFieldsByType};
        reversedFieldNames = {...reversedFieldNames, ...iReversedRefNames};
        workflows.push(...innerEntityFields.workflows);
        let innerGroups = iGroups;
        if (group && iGroups) {
          const groupName = group.name;
          innerGroups = iGroups.map(x=>{return {...x, name: groupName + "." + x.name}})
        }
        let labels: LangLabelsType = {en: {s: "Group"}};
        if (argPresence.labels) {
          labels = getLabels(getArgs("labels", argList), defaultLanguage);
        }
        let description;
        if (argPresence.description) {
          labels = getLabels(getArgs("description", argList), defaultLanguage);
        }
        groups.push({
          name: child.name,
          labels,
          description: description,
          groups: innerGroups,
          fields: innerFields,
          fieldsByName: iFieldsByName,
          looseFields: false}
        );
      } else {
        let displayId;
        if (argPresence.displayId) {
          displayId = getArgs("displayId", argList);
        }
        let labels;
        if (argPresence.labels) {
          labels = getLabels(getArgs("labels", argList), defaultLanguage);
        }
        let nestedLevels: number | undefined;
        if (argPresence.nestedLevels) {
          const args = getArgs("nestedLevels", argList);
          nestedLevels = parseInt(args[0], 10);
        }
        let max: number | Date | undefined;
        if (argPresence.max) {
          const args = getArgs("max", argList);
          if (fieldType === "date" || fieldType === "dateTime") {
              max = new Date(args[0]);
          } else {
              max = parseInt(args[0], 10);
          }
        }
        let min: number | Date | undefined;
        if (argPresence.min) {
          const args = getArgs("min", argList);
          if (fieldType === "date" || fieldType === "dateTime") {
              min = new Date(args[0]);
          } else {
              min = parseInt(args[0], 10);
          }
        }
        let validations;
        if (argPresence.validations) {
          validations = getArgs("validations", argList);
        }
        let filterReferences;
        if (argPresence.filterReferences) {
          filterReferences = getArgs("filterReferences", argList);
        }
        const onlyOnServer = argPresence.onlyOnServer;
        const fillingOnServer = argPresence.fillingOnServer || argPresence.workflow;
        const mappedType = mapType(fieldType);
        const ref = argList.flat().filter((x: any)=>x==="ref").length > 0;
        let show: boolean | Record<string, any> = argList.flat().filter((x: any)=>x==="show").length > 0;
        if (show && child.blocks && child.blocks.length >= 2) {
          show = {};
          for (const item of child.blocks) {
            if (!reversedFieldNames[fieldType]) {
              reversedFieldNames[fieldType] = {};
            }
            if (item.name === "detailField") {
              reversedFieldNames[fieldType][item.value.name] = child.name;
            }
            show = {...show, [item.name]: item.value.name};
          }
        }
        const miniForm = argList.flat().filter((x: any)=>x==="miniForm").length > 0;
        const filterByMasterEntity = argList.flat().filter((x: any)=>x==="filterByMasterEntity").length > 0;
        let masterEntityField;
        if (filterByMasterEntity) {
          masterEntityField = getArgs("filterByMasterEntity", argList);
          if (masterEntityField.length === 0) {
            masterEntityField = undefined;
          }
        }
        const multi = argList.flat().filter((x: any)=>x==="set").length > 0;
        const multilang = argList.flat().filter((x: any)=>x==="multilang").length > 0;
        const nullable = argList.flat().filter((x: any)=>x==="maybe").length > 0;

        const multilineString = mappedType === "String" && argPresence.multilineString;

        let mask: MaskType | undefined;
        if (argPresence.mask) {
            const maskedString = getArgs("mask", argList);
            mask = {
              mask: maskedString[0],
              // formatChars: {
              //   [key: string]: string;
              // };
              // maskChar?: string | null;
            }
        }

        let fieldControl;
        if (argPresence.control) {
            fieldControl = getArgs("control", argList);
        }

        let visibleForRole;
        if (argPresence.visibleForRole) {
          visibleForRole = getArgs("visibleForRole", argList);
        }

        if (argPresence.unique) {
          uniqueFields.push(child.name);
        }
        let field: EntityField;

        if (mappedType) {
          field = {
            name: child.name,
            groupName: group.name,
            type: mappedType,
            multi,
            control: fieldControl,
            visibleForRole,
            multilang,
            multilineString,
            mask,
            hideOnApi,
            ref,
            filterReferences,
            show,
            fillingOnServer,
            onlyOnServer,
            nestedLevels,
            max,
            min,
            miniForm: miniForm,
            filterByMasterEntity,
            masterEntityField,
            labels,
            validations,
            solved: true,
            nullable,
            fieldArgs,
            workflowName: workflowName,
            unique: !!argPresence.unique,
            parentEntityName: entityName,
          };
          fieldsByName[child.name] = field;
          if (!fieldsByType[field.type]) {
            fieldsByType[field.type] = [];
          }
          fieldsByType[field.type].push(field);
        } else {
          field = {
            name: child.name,
            groupName: group.name,
            multi,
            multilang,
            control: fieldControl,
            visibleForRole,
            ref,
            filterReferences,
            show,
            fillingOnServer,
            onlyOnServer,
            nestedLevels,
            miniForm: miniForm,
            filterByMasterEntity,
            masterEntityField,
            displayId,
            hideOnApi,
            resolver: (resolving: Set<string>) => resolveDependentEntity(fieldType, resolving),
            labels: labels,
            solved: false,
            entityName: fieldType,
            unique: !!argPresence.unique,
            nullable,
            fieldArgs,
            workflowName: workflowName,
            type: ref ? "__Reference" : "__SubEntity",
            parentEntityName: entityName,
          };
          if (miniForm && !miniForms[fieldType]) {
              miniForms[fieldType] = [{entityName}];
          } else if (miniForm) {
              miniForms[fieldType].push({entityName});
          }
          fieldsByName[child.name] = field;
          if (!fieldsByType[field.type]) {
            fieldsByType[field.type] = [];
          }
          fieldsByType[field.type].push(field);
          if (!ref) {
            if (!subEntities[fieldType]) {
              subEntities[fieldType] = [];
            }
            subEntities[fieldType].push({entityName: entityName, fieldName: child.name});
          }
        }

        if (workflowName) {
          workflows.push({workflowName, field})
        }

        if (group.looseFields) {
          group.fields.push(field);
        }
        fields.push(field);
      }
    }
    return {
        fields,
        uniqueFields,
        groups,
        fieldsByName,
        fieldsByType,
        reversedFieldNames,
        workflows,
        entityNames,
    };
}

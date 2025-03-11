import * as _ from "lodash";
import {
    LangLabelsType,
    GraphQLFieldTypes,
    Entity,
    SyntaxTree,
    Workflow,
    CustomView,
    HaikuMenu,
    BlocksType,
    DisplayIdPrefix,
    WorkflowState,
    CreateFormModeType,
    EntityField,
    Role, HaikuImplementedLangs, EntityPermission,
} from "./HaikuTypes";

import {getArgs, getAttributes, getLabels} from "./haikuAttributes";
import {getWorkflowParts} from "./haikuWorkflow";
import {getRoleParts} from "./haikuRole";
import {getMenu} from "./haikuMenu";
import {getEntityFields, resolveDependentEntity} from "./haikuEntityFields";

export function completeLangs(value: LangLabelsType, languages: HaikuImplementedLangs[], defaultValue: string | undefined) {
  const langs: LangLabelsType = {};
  let missingLangs = [...languages];
  for (const [lang, text] of Object.entries(value)) {
    langs[lang] = text;
    missingLangs = missingLangs.filter(x => x != lang);
  }
  for (let lang of missingLangs) {
    if (defaultValue) {
      langs[lang] = {s: defaultValue};
    } else {
      langs[lang] = {s: "<undefined>"};
    }
  }
  return langs;
}

export type KnownLanguages = ("en"| "es" | "pt");

export class Haiku {
  private _entitiesNames: string[] = [];
  private _superUserEntities: Record<string, string[]> = {};
  private _allTenantsEntities: Record<string, string[]> = {};
  private _workflowNames: string[] = [];
  private _roleNames: string[] = [];
  private _generatedHistoryEntitiesNames: string[] = [];
  private _entities: Record<string, Entity> = {};
  private _workflows: Record<string, Workflow> = {};
  private _roles: Record<string, Role> = {};
  private _customViews: Record<string, CustomView> = {};
  private _customViewNames: string[] = [];
  private _menus: Record<string, HaikuMenu> = {};
  syntaxTree: SyntaxTree;
  augmentedBlocks: BlocksType[];
  private _usedIcons: Record<string, string[]> = {};
  subEntities: Record<string, {entityName: string, fieldName: string}[]> = {};
  private miniForms: Record<string, {entityName: string}[]> = {};
  private readonly haikuConfigData_: {
      name: string;
      title: { [lang in KnownLanguages]: string };
      languages: { [lang: string]: KnownLanguages};
      multiTenancy: boolean;
      systemOwner: string;
      timeZones: {[lang in KnownLanguages]: string};
      timeFormats: {[lang in KnownLanguages]: string};
      sources: string[];
      outRootDir: string;
      monorepo?: string;
      site: string;
      serverIP: string;
      adminEmail: string;
      superAdminEmail: string;
      seeds: string[];
      useWebhooks: boolean;
      defaults?: {createFormMode: CreateFormModeType};

  };
  reversedRefNames: Record<string, Record<string, string>> = {};
  entitiesUsedInTransitions: Record<string, boolean> = {};

  constructor(syntaxTree: SyntaxTree, haikuConfigData?: any) {
    this.syntaxTree = syntaxTree;
    this.haikuConfigData_ = haikuConfigData;
    this.augmentedBlocks = this.buildAugmentedBlocks();
    this.generateTree();
  }

  get languages(): KnownLanguages[] {
    return Object.values(this.haikuConfigData_.languages);
  }

  get useWebhooks(): boolean {
    return this.haikuConfigData_.useWebhooks;
  }

  get defaultLanguage() {
    return Object.values(this.haikuConfigData_.languages)[0] as HaikuImplementedLangs;
  }

  get superUserEntities() {
    return this._superUserEntities;
  }

  get allTenantsEntities() {
    return this._allTenantsEntities;
  }

  get isMultilang() {
    return this.haikuConfigData_.languages && Object.keys(this.haikuConfigData_.languages).length > 1;
  }

  get haikuConfigData() {
    return this.haikuConfigData_;
  }

  stringFieldsOnDisplayId(entityName: string) {
    const entity = this._entities[entityName];
    let fields: (string[])[] = [];
    if (entity.displayId) {

      const getStringFields = (expr: string, entity: Entity): string[] | {displayIdParts: (string[])[]} => {
        const displayIdIndex = expr.indexOf(DisplayIdPrefix);
        const names = expr.split(".");
        if (entity.fieldsByName[expr] && entity.fieldsByName[expr].type === GraphQLFieldTypes.String) {
          return [expr];
        } else if (names.length > 1) {
          const field = entity.fieldsByName[names[0]];
          if (field && field.entityName) {
            const nestedEntity = this._entities[field.entityName];
            const nestedFields = getStringFields(names.slice(1).join("."), nestedEntity);
            if (Array.isArray(nestedFields) && nestedFields.length > 0) {
              return [field.name, ...nestedFields];
            } else if (!Array.isArray(nestedFields))
              return {displayIdParts: nestedFields.displayIdParts.map(x=>{return [field.name, ...x]})};
            }
        } else if (displayIdIndex === 0) {
          const entityName = names[0].slice(DisplayIdPrefix.length);
          const displayIdFields = this.stringFieldsOnDisplayId(entityName);
          if (Array.isArray(displayIdFields)) {
            return {displayIdParts: displayIdFields}
          }
          return [];
        }
        return [];
      }

      entity.displayId.forEach(x=>{
        const f = getStringFields(x, entity);
        if (Array.isArray(f) && f.length > 0) {
          fields.push(f);
        } else if (!Array.isArray(f)) {
          f.displayIdParts.forEach(x=>{
            fields.push(x)
          })
        }
      })
    } else if (entity.uniqueFields) {
      entity.uniqueFields.forEach(x=>{
        if (entity.fieldsByName[x].type === GraphQLFieldTypes.String) {
          fields.push([x]);
        }
      });
    }
    return fields;
  }

  getDisplayId(entityName: string) {
    const entity = this._entities[entityName];
    if (entity.displayId) {
      return entity.displayId;
    } else if (entity.uniqueFields && entity.uniqueFields.length > 0) {
      return [entity.uniqueFields[0]];
    } else {
      return [`"${entity.name}"`, "id"];
    }
  }

  buildAugmentedBlocks() {
    const augmentedBlocks: BlocksType[] = [];
    for (const block of this.syntaxTree.blocks) {
      const [blockType, argPresence, _argList] = getAttributes(block.value);
      if (blockType === "entity" && argPresence.history && block.blocks) {
        const historyEntityName = `${block.name}_History`;
        this._generatedHistoryEntitiesNames.push(historyEntityName);
        const isJsonHistory = true;
        let blocks: any[] = [];
        let value: any;
        if (isJsonHistory) {
          // blocks = [{
          //   type: "block",
          //   name: "data",
          //   value: {
          //     type: "call",
          //     callee: {
          //       type: "identifier",
          //       name: "labels"
          //     },
          //     args: [
          //       {type: "identifier", name: "json"},
          //       {type: "stringLiteral", value: "Data"},
          //     ],
          //     kwargs: []
          //   },
          //   blocks:[]
          // }];

          const [_blockType, argPresence, argList] = getAttributes(block.value);
          let labelArgs;
          if (argPresence.labels) {
            labelArgs = getArgs("labels", argList);
          }
          value = {
            type: "call",
            callee: {
              type: "identifier",
              name: "labels"
            },
            args: [
              {type: "identifier", name: "entity"},
              {type: "stringLiteral", value: labelArgs && labelArgs[0] ? labelArgs[0] : block.name},
              {type: "stringLiteral", value: labelArgs && labelArgs.length > 1 ? labelArgs[1] : block.name},
            ],
            kwargs: []
          };
        } else {
          blocks = block.blocks.map(x=>_.cloneDeep(x));
          value = _.cloneDeep(block.value);
        }
        const newBlock: BlocksType = {
          isGeneratedHistory: true,
          isJsonHistory,
          type: "block",
          name: historyEntityName,
          value,
          blocks,
        };
        augmentedBlocks.push(newBlock)
      }
    }
    return [...this.syntaxTree.blocks, ...augmentedBlocks];
  }

  private generateTree() {
    const pending: (()=>void)[] = [];
    for (const block of this.augmentedBlocks) {
      if (block.name.slice(0,8) === "__Fake__") {
        continue
      }
      if (block.blocks) {
        const [blockType, argPresence, argList] = getAttributes(block.value);
        let labels: undefined | LangLabelsType = undefined;
        if (argPresence.labels) {
          labels = getLabels(getArgs("labels", argList), this.defaultLanguage);
        }
        let listDisplay;
        if (!block.isJsonHistory && argPresence.listDisplay) {
          listDisplay = getArgs("listDisplay", argList)
        }
        let avoidForList = [];
        if (argPresence.avoidForList) {
          avoidForList = getArgs("avoidForList", argList)
        }
        if (argPresence.listAvoid) {
          avoidForList = [...avoidForList, ...getArgs("listAvoid", argList)];
        }
        let avoidForHistory = [];
        if (argPresence.avoidForHistory) {
          avoidForHistory = getArgs("avoidForHistory", argList)
        }
        let listTextSearch;
        if (!block.isJsonHistory && argPresence.listTextSearch) {
          listTextSearch = getArgs("listTextSearch", argList)
        }
        const filterGrid = argPresence.filterGrid;
        let createAvoid;
        if (argPresence.createAvoid) {
          createAvoid = getArgs("createAvoid", argList)
        }
        if (blockType === "menu") {
          pending.push(() => {
            const menuItem = getMenu(block, [], this.languages, this.defaultLanguage, this._usedIcons);
            if (menuItem) {
              this._menus[block.name] = menuItem as HaikuMenu;
            }
          })
        } else if (blockType === "role") {
          const [_blockType, argPresence, argList] = getAttributes(block.value);
          const roleName = block.name;
          let labels: undefined | LangLabelsType = undefined;
          if (argPresence.labels) {
            labels = getLabels(getArgs("labels", argList), this.defaultLanguage);
          }
          const roleParts = getRoleParts(block);
          this._roles[roleName] = {
            name: roleName,
            labels,
            entities: roleParts.entities,
          }
          this._roleNames.push(roleName);

        } else if (blockType === "workflow") {
          const [_blockType, argPresence, argList] = getAttributes(block.value);
          const workflowName = block.name;
          let labels: undefined | LangLabelsType = undefined;
          if (argPresence.labels) {
            labels = getLabels(getArgs("labels", argList), this.defaultLanguage);
          }
          const workflowParts = getWorkflowParts(block, this.defaultLanguage);
          this.entitiesUsedInTransitions = {...this.entitiesUsedInTransitions, ...workflowParts.entitiesUsedInTransitions};
          let initialState: undefined | WorkflowState = undefined;
          if (argPresence.initialState) {
            initialState = workflowParts.states[getArgs("initialState", argList)[0]];
          }
          this._workflows[workflowName] = {
            name: workflowName,
            labels,
            transitions: workflowParts.transitions,
            states: workflowParts.states,
            groups: workflowParts.groups,
            initialState,
          }
          this._workflowNames.push(workflowName);

        } else if (blockType === "entity") {
          const entityContent = getEntityFields(block, this.defaultLanguage, this.miniForms, this.subEntities);
          let fields = entityContent.fields;
          const uniqueFields = entityContent.uniqueFields;
          const groups = entityContent.groups;
          const fieldsByName = entityContent.fieldsByName;
          const fieldsByType = entityContent.fieldsByType;
          this.reversedRefNames = {...this.reversedRefNames, ...entityContent.reversedFieldNames};
          const workflows = entityContent.workflows;
          this._entitiesNames.push(...entityContent.entityNames);

          let [_type, argPresence, argList] = getAttributes(block.value);
          const compoundUniques: string[] = [];
          const indexes: string[][] = [];
          const virtualUniques: {name: string, fields: string[]}[] = [];

          let superUser;
          const isSuperUser = argPresence.superUser;
          if (isSuperUser) {
              superUser = this._superUserEntities[block.name] = getArgs("superUser", argList);
          }

          let allTenants;
          const isAllTenants = argPresence.allTenants;
          if (isAllTenants) {
              allTenants = this._allTenantsEntities[block.name] = getArgs("allTenants", argList);
          }

          if (argPresence.virtualUnique) {
             const virtuals = getArgs("virtualUnique", argList);
             if (Array.isArray(virtuals[0])) {
                virtualUniques.push(...virtuals.map((x: string[]) => {return {name: x[0], fields: x.slice(1)}}));
             } else {
                virtualUniques.push({name: virtuals[0], fields: virtuals.slice(1)});
             }
          }

          const publicPermissions: EntityPermission[] = argPresence.public ? getArgs("public", argList) : [];

          let displayId;
          if (argPresence.displayId) {
            displayId = getArgs("displayId", argList);
          }
          let defaultOrderBy;
          if (argPresence.defaultOrderBy) {
            const [columnName, direction] = getArgs("defaultOrderBy", argList);
            defaultOrderBy = {columnName, direction};
          }

          if (argPresence.index) {
            indexes.push(...[getArgs("index", argList)]);
          }
          if (argPresence.unique) {
            compoundUniques.push(...getArgs("unique", argList));
          }
          let createFormMode: CreateFormModeType = this.haikuConfigData_.defaults?.createFormMode || "sideBar";
          if (argPresence.createFormMode) {
            createFormMode = getArgs("createFormMode", argList)[0];
          }
          
          const customId = argPresence.customId;

          const hasHistory = argPresence.history && !block.isGeneratedHistory;

          if (hasHistory) {
            const historyEntityName = `${block.name}_History`;
            const historyFieldName = `historySet_`;
            const historyField: EntityField =
            {
                name: historyFieldName,
                groupName: null,
                multi: true,
                multilang: false,
                ref: false,
                hideOnApi: false,
                fillingOnServer: false,
                resolver: (resolving: Set<string>) => resolveDependentEntity(historyField, resolving),
                labels: {en: {s: "History Item", p: "History Set"}},
                isHistorySet: true,
                solved: false,
                entityName: historyEntityName,
                unique: false,
                nullable: true,
                type: "__SubEntity",
                parentEntityName: block.name,
              };
            const currentRevision: EntityField = {
                  name: "currentRevision",
                  customCreateInServer: true,
                  customUpdateInServer: true,
                  readOnly: true,
                  fillingOnServer: true,
                  groupName: null,
                  type: GraphQLFieldTypes.Integer,
                  defaultValue: "0",
                  multi: false,
                  multilang: false,
                  multilineString: false,
                  mask: undefined,
                  hideOnApi: false,
                  ref: false,
                  nestedLevels: undefined,
                  miniForm: false,
                  filterByMasterEntity: false,
                  masterEntityField: undefined,
                  labels: {es: {s: "Revisión"}, en: {s: "Revision"}},
                  validations: undefined,
                  solved: true,
                  nullable: false,
                  fieldArgs: undefined,
                  unique: false,
                  parentEntityName: block.name,
            };
            fields.push(historyField);
            fields.push(currentRevision);
            const nullGroup = groups.filter(x=>x.name===null);
            if (nullGroup.length > 0) {
              // nullGroup[0].fields.push(historyField);
              // nullGroup[0].fieldsByName[historyField.name] = historyField;
              nullGroup[0].fields.push(currentRevision);
              nullGroup[0].fieldsByName[currentRevision.name] = currentRevision;
            } else {
              groups.push({
                name: null,
                labels: {},
                fields: [
                  // historyField,
                  currentRevision
                ],
                looseFields: true,
                fieldsByName: {
                  // [historyField.name]: historyField,
                  [currentRevision.name]: currentRevision
                }
              });
            }
            fieldsByName[historyFieldName] = historyField;
            if (!fieldsByType[historyEntityName]) {
              fieldsByType[historyEntityName] = [];
            }
            fieldsByType[historyEntityName].push(historyField);
            if (!this.subEntities[historyEntityName]) {
              this.subEntities[historyEntityName] = [];
            }
            this.subEntities[historyEntityName].push({entityName: block.name, fieldName: historyFieldName});
          }
          if (block.isGeneratedHistory) {
            if (labels) {
              const newLabels: any = {};
              for (const [key, value] of Object.entries(labels)) {
                newLabels[key] = value.g ? {s: value.s + " (H)", p: value.p + " (H)", g: value.g} : {s: value.s + " (H)", p: value.p + " (H)"};
              }
              labels = newLabels;
            }
          }
          if (block.isGeneratedHistory) {
            if (block.isJsonHistory) {
              listDisplay = ["createdAt_", "createdBy_", "revision"];
              fields = [
                {
                  name: "data",
                  groupName: null,
                  type: GraphQLFieldTypes.Json,
                  customCreateInServer: true,
                  customUpdateInServer: true,
                  multi: false,
                  fillingOnServer: false,
                  multilang: false,
                  multilineString: false,
                  mask: undefined,
                  hideOnApi: false,
                  ref: false,
                  nestedLevels: undefined,
                  miniForm: false,
                  filterByMasterEntity: false,
                  masterEntityField: undefined,
                  labels: {es: {s: "Estado"}, en: {s: "State"}},
                  validations: undefined,
                  solved: true,
                  nullable: false,
                  fieldArgs: undefined,
                  unique: false,
                  parentEntityName: block.name,
                },
              ];
            }
            fields.push({
                  name: "revision",
                  groupName: null,
                  type: GraphQLFieldTypes.Integer,
                  customCreateInServer: true,
                  customUpdateInServer: true,
                  multi: false,
                  fillingOnServer: false,
                  multilang: false,
                  multilineString: false,
                  mask: undefined,
                  hideOnApi: false,
                  ref: false,
                  nestedLevels: undefined,
                  miniForm: false,
                  filterByMasterEntity: false,
                  masterEntityField: undefined,
                  labels: {es: {s: "Revisión"}, en: {s: "Revision"}},
                  validations: undefined,
                  solved: true,
                  nullable: false,
                  fieldArgs: undefined,
                  unique: false,
                  parentEntityName: block.name,
            });
          }
          this._entities[block.name] = {
            name: block.name,
            fields,
            fieldsByName: fieldsByName,
            fieldsByType: fieldsByType,
            labels,
            listDisplay,
            avoidForList,
            avoidForHistory,
            publicPermissions,
            displayId,
            defaultOrderBy,
            listTextSearch,
            filterGrid,
            createAvoid,
            workflows,
            createFormMode,
            uniqueFields,
            compoundUniques,
            indexes,
            virtualUniques,
            customId,
            isGeneratedHistory: block.isGeneratedHistory || false,
            isJsonHistory: block.isJsonHistory || false,
            history: hasHistory,
            parentEntities: [],
            childrenEntities: [],
            groups,
            superUser,
            allTenants,
          };
        } else if (blockType === "customView") {
          if (this._customViews[block.name] || this._entities[block.name]) {
            throw new Error(`Duplicated name of custom view ${block.name}`);
          }
          const [_, argPresence, argList] = getAttributes(block.value);
          let labels: undefined | LangLabelsType = undefined;
          if (argPresence.labels) {
            labels = getLabels(getArgs("labels", argList), this.defaultLanguage);
          }
          const storeSingleton = argPresence.storeSingleton;
          const publicPermissions: EntityPermission[] = argPresence.public ? getArgs("public", argList) : [];
          this._customViewNames.push(block.name);
          this._customViews[block.name] = {
            name: block.name,
            labels,
            publicPermissions,
            storeSingleton
          }
        }
      }
    }
    Object.values(this._entities).forEach(entity => {
      entity.fields.forEach(field => {
        resolveDependentEntity(field, new Set<string>());
      })
      if (entity.displayId) {
        entity.displayIdHasMultilangFields = entity.displayId.map(x=> x !== "id" && entity.fieldsByName[x] && entity.fieldsByName[x].multilang).reduce((x, y)=> x||y);
      } else {
        entity.displayIdHasMultilangFields = false;
      }
      if (entity.name in this.miniForms) {
        entity.miniForm = true;
      }
    })
    pending.forEach(x => x());
    Object.keys(this.subEntities).forEach(subEntity => {
      this._entities[subEntity].parentEntities = this.subEntities[subEntity];
    });
  }

  getUsedIcons(menuId: string) {
    return new Set(this._usedIcons[menuId]);
  }

  get entitiesNames() {
    return this._entitiesNames;
  }

  get workflowNames() {
    return this._workflowNames;
  }

  get roleNames() {
    return this._roleNames;
  }

  get customViewNames() {
    return this._customViewNames;
  }

  get historyEntitiesNames() {
    return this._generatedHistoryEntitiesNames;
  }

  menu(menuName: string) {
    return this._menus[menuName];
  }

  get menuNames() {
    return Object.keys(this._menus);
  }

  entity(entityName: string) {
    return this._entities[entityName];
  }

  workflow(workflowName: string) {
    return this._workflows[workflowName];
  }

  roleByName(roleName: string) {
    return this._roles[roleName];
  }

  get roles() {
    return Object.values(this._roles);
  }

  customView(customViewName: string) {
    return this._customViews[customViewName];
  }

  fields(entityName: string) {
    return this._entities[entityName].fields;
  }
}

export type EntityPermission = "create" | "retrieve" | "update" | "delete";

export type HaikuImplementedLangs = "en" | "es" | "pt";
export type OneLangLabel = { s: string, p?: string | undefined, g?: "m" | "f" | undefined};

export type LangLabelsType = Record<string, OneLangLabel>;

export type EntityFieldType = GraphQLFieldTypes | "__SubEntity" | "__Reference";
export type HaikuFieldTypes = "json" | "userEmail" | "userPassword" | "userActive" | "string" | "boolean" | "integer";

export type CreateFormModeType = "sideBar" | "newTab";

export type UsedIcons = Record<string, string[]>;

export enum GraphQLFieldTypes {
  Json="Json",
  String="String",
  Boolean="Boolean",
  Integer="Int",
  Decimal="Decimal",
  Date="Date",
  DateTime="DateTime",
  File="File",
}

export const DisplayIdPrefix = "displayId:";

export const fieldTypeToTypescript = (type: EntityFieldType, nullable: boolean) => {
  return {
  Json: "string",
  String: "string",
  File: "string",
  Boolean: "boolean",
  Int: nullable ? "number | undefined" : "number",
  Decimal: nullable ? "number | undefined" : "number",
  Date: nullable ? "Date | null" : "Date",
  DateTime: nullable ? "Date | null" : "Date",
  __SubEntity: "object",
  __Reference: "string"
  } [type];
}

export type ValueArg = {
  type: string;
  name?: HaikuFieldTypes;
  value?: string;
}

export type CalleeArg = {
  type: string;
  name: string;
}

export type BlockValue = {
  type: string;
  name: string;
  callee?: CalleeArg;
  args: ValueArg[];
  kwargs: any[];
}

export type BlocksType = {
  name: string;
  type: string;
  isGeneratedHistory?: boolean;
  isJsonHistory?: boolean;
  value: BlockValue;
  blocks?: BlocksType[];
}

export type SyntaxTree = {
  tree: any[];
  blocks: BlocksType[];
  imports: any[];
}

export type EntityGroup = {
  name: string | null;
  labels: LangLabelsType;
  description?: string;
  fields: EntityField[];
  fieldsByName: {[key: string]: EntityField};
  groups?: EntityGroup[];
  looseFields: boolean;
}

export type MaskType = {
  mask: string;
  formatChars?: {
    [key: string]: string;
  };
  maskChar?: string | null;
};


export type EntityField = {
  name: string;
  solved: boolean;
  groupName: string | null;
  multi?: boolean;
  multilineString?: boolean;
  mask?: MaskType;
  multilang?: boolean;
  ref?: boolean;
  filterReferences?: string;
  reversedRefName?: string;
  show?: boolean | Record<string, any>;
  fillingOnServer: boolean;
  onlyOnServer?: boolean;
  defaultValue?: string;
  customCreateInServer?: boolean;
  customUpdateInServer?: boolean;
  readOnly?: boolean;
  nestedLevels?: number;
  max?: number | Date;
  min?: number | Date;
  miniForm?: boolean;
  filterByMasterEntity?: boolean;
  masterEntityField?: string;
  hideOnApi: boolean;
  entityName?: string;
  isHistorySet?: boolean;
  workflowName?: string;
  parentEntityName: string;
  displayId?: string[];
  labels?: LangLabelsType;
  validations?: string[];
  resolver?: (resolving: Set<string>) => void;
  unique: boolean;
  nullable: boolean;
  fieldArgs?: any;
  type: EntityFieldType;
  control?: string[];
  visibleForRole?: Record<string,string[]>;
}

export type Entity = {
  name: string;
  fields: EntityField[];
  fieldsByName: {[key: string]: EntityField};
  fieldsByType: {[key: string]: EntityField[]};
  displayId?: string[];
  indexes?: string[][];
  defaultOrderBy?: {columnName: string, direction: "Asc" | "Desc"};
  miniForm?: boolean;
  publicPermissions?: EntityPermission[];
  displayIdHasMultilangFields?: boolean;
  uniqueFields: string[];
  compoundUniques: string[];
  virtualUniques: {name: string, fields: string[]}[];
  listDisplay?: string[];
  avoidForList?: string[];
  avoidForHistory?: string[];
  listTextSearch?: string[];
  filterGrid?: boolean;
  createAvoid?: string[];
  createFormMode: CreateFormModeType;
  labels?: LangLabelsType;
  workflows: {workflowName: string, field: EntityField}[];
  history: boolean;
  isGeneratedHistory: boolean;
  isJsonHistory: boolean;
  customId: boolean;
  parentEntities: {entityName: string, fieldName: string}[];
  childrenEntities: {entityName: string, fieldName: string}[];
  groups: EntityGroup[];
  superUser?: Record<string,string[]>;
  allTenants?: Record<string,string[]>;
}

export type WorkflowState = {
  name: string;
  labels?: LangLabelsType;
}

export type WorkflowGroup = {
  name: string;
  labels?: LangLabelsType;
}

export type WorkflowTransition = {
  name: string;
  labels?: LangLabelsType;
  from: WorkflowState;
  to: WorkflowState;
  entity?: string;
  clientForm?: boolean;
  triggerOnServer?: boolean;
  group?: WorkflowGroup;
}

export type Workflow = {
  name: string;
  labels?: LangLabelsType;
  initialState?: WorkflowState;
  transitions: Record<string, WorkflowTransition>;
  states: Record<string, WorkflowState>;
  groups: Record<string, WorkflowGroup>;
}

export type RoleEntityPermissions = {
  entityName: string;
  permissions?: EntityPermission[];
}

export type Role = {
  name: string;
  labels?: LangLabelsType;
  entities: Record<string, RoleEntityPermissions>;
}

export type CustomView = {
  name: string;
  labels?: LangLabelsType;
  publicPermissions?: EntityPermission[];
  storeSingleton: boolean;
}

export type HaikuMenuItem = {
  name: string;
  url: string;
  args?: string;
  icon: string;
  labels:  LangLabelsType;
  permission: string;
  id: string;
}

export type HaikuMenuDivider = {
  icon: "__divider__";
  labels:  LangLabelsType;
  id: string;
}

export type HaikuMenu = {
  name: string;
  id: string;
  icon: string;
  labels:  LangLabelsType;
  items: (HaikuMenuItem | HaikuMenu | HaikuMenuDivider)[];
}

export const mapType = (haikuType: HaikuFieldTypes): EntityFieldType | null => {
  const result = {
    "json": GraphQLFieldTypes.Json,
    "string": GraphQLFieldTypes.String,
    "date": GraphQLFieldTypes.Date,
    "dateTime": GraphQLFieldTypes.DateTime,
    "userEmail": GraphQLFieldTypes.String,
    "userActive": GraphQLFieldTypes.Boolean,
    "userPassword": GraphQLFieldTypes.String,
    "boolean": GraphQLFieldTypes.Boolean,
    "integer": GraphQLFieldTypes.Integer,
    "decimal": GraphQLFieldTypes.Decimal,
    "file": GraphQLFieldTypes.File,
  }[haikuType];
  if (result) return result;
  return null;
}

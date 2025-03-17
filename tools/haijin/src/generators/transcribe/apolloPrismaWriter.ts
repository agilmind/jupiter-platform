import { Tree } from '@nx/devkit';
import { Haiku } from '@haiku';
import { schemaPrismaTs } from '@haiku/apolloPrisma/prisma/schema.prisma';
import * as path from 'path';
import { firstLower, firstUpper, formatCode } from '../utils/formatCode';
import {apiErrorTs} from '@haiku/apolloPrisma/common/errors/ApiError.ts';
import {commonGraphQL} from '@haiku/apolloPrisma/common/schemas/common.graphql';
import {commonUtilsIndexTs} from '@haiku/apolloPrisma/common/utils/index.ts';
import {commonUtilsEmailTs} from '@haiku/apolloPrisma/common/utils/email.ts';
import {commonSchemasIndexTs} from '@haiku/apolloPrisma/common/schemas/index.ts';
import {serviceContextTs} from '@haiku/apolloPrisma/service-context.ts';
import {graphQLErrorTs} from '@haiku/apolloPrisma/common/errors/GraphQLError.ts';
import {fileUploadTs} from '@haiku/apolloPrisma/common/resolvers/fileUpload.ts';
import {serverTs} from '@haiku/apolloPrisma/server.ts';
import {profileResolversTs} from '@haiku/apolloPrisma/common/resolvers/profileResolvers.ts';
import {
  commonConstantsTs
} from '@haiku/apolloPrisma/common/constants.ts';
import {
  conversionsTs
} from '@haiku/apolloPrisma/common/utils/conversions.ts';
import {
  prismaUtilsTs
} from '@haiku/apolloPrisma/common/utils/prismaUtils.ts';
import {
  commonUtilsNullsTs
} from '@haiku/apolloPrisma/common/utils/nulls.ts';
import {
  fileSetterTs
} from '@haiku/apolloPrisma/common/utils/fileSetter.ts';
import {
  moveUploadedFilesTs
} from '@haiku/apolloPrisma/common/utils/moveUploadedFiles.ts';
import {
  duplicatesErrorTs
} from '@haiku/apolloPrisma/common/errors/DuplicatesError.ts';
import {
  prismaErrorTs
} from '@haiku/apolloPrisma/common/errors/PrismaError.ts';
import {
  commonErrorsIndexTs
} from '@haiku/apolloPrisma/common/errors/index.ts';
import {
  anyApiErrorTs
} from '@haiku/apolloPrisma/common/errors/AnyApiErrorTs';
import {
  unknownErrorHelperTs
} from '@haiku/apolloPrisma/common/errors/unknownErrorHelper.ts';
import {
  commonTypesServiceTs
} from '@haiku/apolloPrisma/common/types/serviceTypes.ts';
import {
  commonTypesIndexTs
} from '@haiku/apolloPrisma/common/types/index.ts';
import { AdditionalResolversType } from '@haiku/server/types';
import {
  userResolversTs
} from '@haiku/apolloPrisma/entities/entity/resolvers/userResolvers';
import { entitiesIndexTs } from '@haiku/apolloPrisma/entities/index.ts';
import {
  serviceTypesTs
} from '@haiku/apolloPrisma/entities/service-types.ts';
import {
  entitySchemasIndexTs
} from '@haiku/apolloPrisma/entities/entitySchemasIndexTs';
import {
  schemaGraphqlTs
} from '@haiku/apolloPrisma/entities/entity/schemas/entity.graphql';
import {
  displayIdResolversTs
} from '@haiku/apolloPrisma/entities/entity/resolvers/displayId.ts';
import {
  entityResolversTs
} from '@haiku/apolloPrisma/entities/entity/resolvers/entityResolvers.ts';
import {
  userCreateServiceTs
} from '@haiku/apolloPrisma/entities/entity/services/userCreateService';
import {
  entityCreateServiceTs
} from '@haiku/apolloPrisma/entities/entity/services/entityCreateService.ts';
import {
  entityUpdateServiceTs
} from '@haiku/apolloPrisma/entities/entity/services/entityUpdateService.ts';
import {
  entityDeleteServiceTs
} from '@haiku/apolloPrisma/entities/entity/services/entityDeleteService.ts';
import {
  entityCurrentItemTs
} from '@haiku/apolloPrisma/entities/entity/services/entityCurrentItem.ts';
import {
  entityWorkflowServicesTs
} from '@haiku/apolloPrisma/entities/entity/services/entityWorkflowServices.ts';
import {
  entityListWithCursorServiceTs
} from '@haiku/apolloPrisma/entities/entity/services/entityListWithCursorService.ts';
import {
  entityListWithOffsetServiceTs
} from '@haiku/apolloPrisma/entities/entity/services/entityListWithOffsetService.ts';
import {
  entityOneServiceTs
} from '@haiku/apolloPrisma/entities/entity/services/entityOneService.ts';
import {
  entityServicesIndexTs
} from '@haiku/apolloPrisma/entities/entity/services/index.ts';
import {
  entityFileDownload
} from '@haiku/apolloPrisma/entities/entity/services/entityFileDownload.ts';
import {
  getFileDataTs
} from '@haiku/apolloPrisma/common/utils/download.ts';
import { prismaClientTs } from '@haiku/apolloPrisma/prisma/client.ts';
import { seedUtilsTs } from '@haiku/apolloPrisma/prisma/seed/utils.ts';
import { seedUsersTs } from '@haiku/apolloPrisma/prisma/seed/users.ts';
import {
  seedPermissionsTs
} from '@haiku/apolloPrisma/prisma/seed/permissions.ts';
import {
  seedWorkflowsTs
} from '@haiku/apolloPrisma/prisma/seed/workflows.ts';
import {
  seedCustomRolesTs
} from '@haiku/apolloPrisma/prisma/seed/customRoles.ts';
import { seedRolesTs } from '@haiku/apolloPrisma/prisma/seed/roles.ts';
import { seedTs } from '@haiku/apolloPrisma/prisma/seed/seed.ts';
import {
  multiTenantPrismaClientTs
} from '@haiku/apolloPrisma/prisma/multiTenantPrismaClient.ts';
import {
  tenantMiddlewareTs
} from '@haiku/apolloPrisma/prisma/middleware/tenant.middleware.ts';
import { TranscribeGeneratorSchema } from './schema';
import { randomUUID } from 'crypto';

export function writeApolloPrisma(tree: Tree, targetDir: string, options: TranscribeGeneratorSchema, haiku: Haiku) {
  // tree.write(path.join(targetDir, ".env.sample"), dotEnv(projectName));
  // tree.write(path.join(targetDir, ".env.production.sample"), dotEnvProduction(projectName));
  // tree.write(path.join(targetDir, ".haiku"), `{"projectName": "${projectName}"}`);
  // tree.write(path.join(targetDir, "package.json"), package_json(projectName));
  // tree.write(path.join(targetDir, "jest.config.ts"), formatCode(jestConfigTs()));
  // tree.write(path.join(targetDir, "jest.global-setup.ts"), formatCode(jestGlobalSetupTs()));
  // tree.write(path.join(targetDir, "jest.global-teardown.ts"), formatCode(jestGlobalTeardownTs()));
  // tree.write(path.join(targetDir, "jest.setup.ts"), formatCode(jestSetupTs()));
  // tree.write(path.join(targetDir, "run-docker.sh"), runDockerSh(haiku));
  // tree.write(path.join(targetDir, "processes.json"), processesJsonTs(projectName));
  // tree.write(path.join(targetDir, "tsconfig.json"), tsconfig_json());
  // tree.write(path.join(targetDir, ".gitignore"), gitignore());
  // tree.write(path.join(targetDir, "codegen.yml"), codegenYml());
  // tree.write(path.join(targetDir, "config-spectaql.yml"), configSpectaqlYml(projectName));

  tree.write(path.join(targetDir, "prisma", "schema.prisma"), schemaPrismaTs(haiku));

  const srcDir = path.join(targetDir, "src");
  const defaultAppToken = randomUUID();
  tree.write(path.join(srcDir, "server.ts"), formatCode(serverTs({haiku})));
  tree.write(path.join(srcDir, "service-context.ts"), formatCode(serviceContextTs(
      {roleNames: ["SysAdmin", "User"], defaultAppToken}, haiku)));

  const commonDir = path.join(srcDir, "common");
  tree.write(path.join(commonDir, "schemas", "common.graphql"), formatCode(commonGraphQL(), "graphql"));
  tree.write(path.join(commonDir, "schemas", "index.ts"), formatCode(commonSchemasIndexTs()));
  tree.write(path.join(commonDir, "resolvers", "fileUpload.ts"), formatCode(fileUploadTs()));
  tree.write(path.join(commonDir, "resolvers", "profileResolvers.ts"), formatCode(profileResolversTs()));
  tree.write(path.join(commonDir, "constants.ts"), formatCode(commonConstantsTs()));
  tree.write(path.join(commonDir, "utils", "index.ts"), formatCode(commonUtilsIndexTs()));
  tree.write(path.join(commonDir, "utils", "email.ts"), formatCode(commonUtilsEmailTs()));
  tree.write(path.join(commonDir, "utils", "conversions.ts"), formatCode(conversionsTs()));
  tree.write(path.join(commonDir, "utils", "prismaUtils.ts"), formatCode(prismaUtilsTs()));
  tree.write(path.join(commonDir, "utils", "nulls.ts"), formatCode(commonUtilsNullsTs()));
  tree.write(path.join(commonDir, "utils", "fileSetter.ts"), formatCode(fileSetterTs()));
  tree.write(path.join(commonDir, "utils", "moveUploadedFiles.ts"), formatCode(moveUploadedFilesTs()));
  tree.write(path.join(commonDir, "errors", "GraphQLError.ts"), formatCode(graphQLErrorTs()));
  tree.write(path.join(commonDir, "errors", "ApiError.ts"), formatCode(apiErrorTs()));
  tree.write(path.join(commonDir, "errors", "DuplicatesError.ts"), formatCode(duplicatesErrorTs()));
  tree.write(path.join(commonDir, "errors", "PrismaError.ts"), formatCode(prismaErrorTs()));
  tree.write(path.join(commonDir, "errors", "index.ts"), formatCode(commonErrorsIndexTs()));
  tree.write(path.join(commonDir, "errors", "UnauthorizedError.ts"), formatCode(anyApiErrorTs("UnauthorizedError", "AUTH_UNAUTHORIZED")));
  tree.write(path.join(commonDir, "errors", "PageSizeTooLargeError.ts"), formatCode(anyApiErrorTs("PageSizeTooLargeError", "PAGINATION_SIZE_EXCEEDED")));
  tree.write(path.join(commonDir, "errors", "SkipTooLargeError.ts"), formatCode(anyApiErrorTs("SkipTooLargeError", "PAGINATION_OFFSET_EXCEEDED")));
  tree.write(path.join(commonDir, "errors", "MustBeLoggedInError.ts"), formatCode(anyApiErrorTs("MustBeLoggedInError", "AUTH_CREDENTIALS_REQUIRED")));
  tree.write(path.join(commonDir, "errors", "DoesNotExistError.ts"), formatCode(anyApiErrorTs("DoesNotExistError", "RECORD_NOT_FOUND")));
  tree.write(path.join(commonDir, "errors", "ConcurrencyError.ts"), formatCode(anyApiErrorTs("ConcurrencyError", "RECORD_MODIFIED")));
  tree.write(path.join(commonDir, "errors", "UnknownError.ts"), formatCode(anyApiErrorTs("UnknownError", "SYSTEM_UNKNOWN_ERROR")));
  tree.write(path.join(commonDir, "errors", "NullValueError.ts"), formatCode(anyApiErrorTs("NullValueError", "VALIDATION_REQUIRED")));
  tree.write(path.join(commonDir, "errors", "unknownErrorHelper.ts"), formatCode(unknownErrorHelperTs()));
  tree.write(path.join(commonDir, "types", "serviceTypes.ts"), formatCode(commonTypesServiceTs()));
  tree.write(path.join(commonDir, "types", "index.ts"), formatCode(commonTypesIndexTs()));

  const additionalResolvers: Record<string, AdditionalResolversType> = {
    "User": userResolversTs(),
  }

  const entitiesDir = path.join(srcDir, "entities");
  tree.write(path.join(entitiesDir, "index.ts"), formatCode(entitiesIndexTs(haiku.entitiesNames)));
  tree.write(path.join(entitiesDir, "service-types.ts"), formatCode(serviceTypesTs()));
  const allFilesToDownload: Record<string, {fieldPath: string}[]> = {};
  for (const entityName of haiku.entitiesNames) {
    const lowered = firstLower(entityName);
    const entity = haiku. entity(entityName);
    tree.write(path.join(entitiesDir, lowered, "schemas", "index.ts"), formatCode(entitySchemasIndexTs(lowered)));
    tree.write(path.join(entitiesDir, lowered, "schemas", `${lowered}.graphql`), formatCode(schemaGraphqlTs(entityName, haiku), "graphql"));
    tree.write(path.join(entitiesDir, lowered, "resolvers", "displayId.ts"), formatCode(displayIdResolversTs(entityName, haiku)));
    tree.write(path.join(entitiesDir, lowered, "resolvers", `${lowered}Resolvers.ts`), formatCode(entityResolversTs(
      entityName,
      additionalResolvers[entityName],
      haiku
    )));
    let createService;
    if (entityName === "User") {
      createService = userCreateServiceTs();
    }
    const filesToDownload: {fieldPath: string}[] = [];
    allFilesToDownload[lowered] = filesToDownload;
    if (!entity.isGeneratedHistory) {
      const createCode = formatCode(entityCreateServiceTs(entityName, haiku, createService, filesToDownload));
      const updateCode = formatCode(entityUpdateServiceTs(entityName, haiku, filesToDownload));
      const deleteCode = formatCode(entityDeleteServiceTs(entityName));
      if (!haiku.entitiesUsedInTransitions[entity.name]) {
        tree.write(path.join(entitiesDir, lowered, "services", `${lowered}CreateService.ts`), createCode);
        tree.write(path.join(entitiesDir, lowered, "services", `${lowered}UpdateService.ts`), updateCode);
        tree.write(path.join(entitiesDir, lowered, "services", `${lowered}DeleteService.ts`), deleteCode);
        if (entity.history) {
          tree.write(path.join(entitiesDir, lowered, "services", `${lowered}CurrentItem.ts`), formatCode(entityCurrentItemTs(entityName, haiku)));
        }
      }
    }
    if (entity.workflows.length > 0) {
      tree.write(path.join(entitiesDir, lowered, "services", `${lowered}WorkflowServices.ts`), formatCode(entityWorkflowServicesTs(entityName, haiku)));
    }
    tree.write(path.join(entitiesDir, lowered, "services", `${lowered}ListWithCursorService.ts`), formatCode(entityListWithCursorServiceTs(entityName, haiku)));
    tree.write(path.join(entitiesDir, lowered, "services", `${lowered}ListWithOffsetService.ts`), formatCode(entityListWithOffsetServiceTs(entityName, haiku)));
    tree.write(path.join(entitiesDir, lowered, "services", `${lowered}OneService.ts`), formatCode(entityOneServiceTs(entityName, haiku)));
    tree.write(path.join(entitiesDir, lowered, "services", "index.ts"), formatCode(entityServicesIndexTs(entityName, haiku)));
  }

  for (let lowered of Object.keys(allFilesToDownload)) {
    const files = allFilesToDownload[lowered]
    if (files.length > 0) {
      const entityName = firstUpper(lowered);
      tree.write(path.join(entitiesDir, lowered, "services", `${lowered}FileDownload.ts`), formatCode(entityFileDownload(entityName, haiku)));
    }
  }
  tree.write(path.join(commonDir, "utils", "download.ts"), formatCode(getFileDataTs(haiku)));

  tree.write(path.join(entitiesDir, "permission", "schemas", "index.ts"), formatCode(entitySchemasIndexTs("permission")));

  const prismaDir = path.join(srcDir, "prisma");
  tree.write(path.join(prismaDir, "client.ts"), prismaClientTs());
  tree.write(path.join(prismaDir, "seed", "utils.ts"), formatCode(seedUtilsTs(haiku)));
  tree.write(path.join(prismaDir, "seed", "users.ts"), formatCode(seedUsersTs(haiku)));
  tree.write(path.join(prismaDir, "seed", "permissions.ts"), formatCode(seedPermissionsTs(haiku)));
  const seedsNames = [];
  if (haiku.workflowNames.length > 0) {
    tree.write(path.join(prismaDir, "seed", "workflows.ts"), formatCode(seedWorkflowsTs(haiku)));
  }
  tree.write(path.join(prismaDir, "seed", "customRoles.ts"), formatCode(seedCustomRolesTs(haiku)));
  tree.write(path.join(prismaDir, "seed", "roles.ts"), formatCode(seedRolesTs(haiku, haiku.entitiesNames)));
  tree.write(path.join(prismaDir, "seed", "seed.ts"), formatCode(seedTs(seedsNames || [], haiku)));


  const middlewareDir = path.join(prismaDir, "middleware");
  if (haiku.haikuConfigData.multiTenancy) {
      tree.write(path.join(prismaDir, "multiTenantPrismaClient.ts"), formatCode(multiTenantPrismaClientTs(haiku)));
      tree.write(path.join(middlewareDir, "tenant.middleware.ts"), formatCode(tenantMiddlewareTs(haiku)));
  }
}

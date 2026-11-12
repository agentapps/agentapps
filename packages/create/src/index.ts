/**
 * @agentapps/create — public API exports.
 */

export { dev } from './dev.js';
export { type HealthReport, health } from './health.js';
export { type PackOptions, pack } from './pack.js';
export {
  AGENT_SKILL_DIRS,
  copyTemplate,
  detectPackageManager,
  findRepoRoot,
  getSkillDir,
  getTemplateDir,
  initGit,
  registerInExampleConfig,
  renderTemplate,
  runInstall,
  type ScaffoldMode,
  type ScaffoldOptions,
  type ScaffoldResult,
  scaffold,
  scaffoldApp,
  skillDirsFor,
  type TemplateName,
  tsLiteral,
  validateProjectName,
} from './scaffold.js';
export {
  checkApp,
  findToolBlocks,
  printValidation,
  protocolSupportsAccess,
  type ValidationOptions,
  type ValidationResult,
  validate,
} from './validate.js';

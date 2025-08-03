/**
 * Documentation Infrastructure
 * Exports all documentation-related components
 */

export { documentationPlugin } from './documentation-plugin';
export { swaggerConfig, swaggerUiConfig } from './swagger-config';
export { generateSDK, registerSDKRoutes } from './sdk-generator';
export { registerGuideRoutes } from './guide-routes';

export type { DocumentationPluginOptions } from './documentation-plugin';

export type { SDKGeneratorOptions } from './sdk-generator';

export type { GuideRoutesOptions } from './guide-routes';

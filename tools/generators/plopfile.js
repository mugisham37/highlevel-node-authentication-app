module.exports = function (plop) {
  // Set the base path for templates
  plop.setGenerator('component', {
    description: 'Create a new React component',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Component name:',
        validate: value => {
          if (!value) return 'Component name is required';
          if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
            return 'Component name must be PascalCase';
          }
          return true;
        },
      },
      {
        type: 'list',
        name: 'package',
        message: 'Which package?',
        choices: ['ui', 'web', 'mobile'],
        default: 'ui',
      },
      {
        type: 'confirm',
        name: 'withStory',
        message: 'Include Storybook story?',
        default: true,
        when: answers => answers.package === 'ui',
      },
      {
        type: 'confirm',
        name: 'withTest',
        message: 'Include test file?',
        default: true,
      },
    ],
    actions: data => {
      const actions = [];
      const basePath =
        data.package === 'ui'
          ? 'packages/ui/src/components'
          : data.package === 'web'
            ? 'apps/web/src/components'
            : 'apps/mobile/src/components';

      // Create component file
      actions.push({
        type: 'add',
        path: `${basePath}/{{pascalCase name}}/{{pascalCase name}}.tsx`,
        templateFile: 'tools/generators/templates/component.hbs',
      });

      // Create index file
      actions.push({
        type: 'add',
        path: `${basePath}/{{pascalCase name}}/index.ts`,
        templateFile: 'tools/generators/templates/component-index.hbs',
      });

      // Create test file if requested
      if (data.withTest) {
        actions.push({
          type: 'add',
          path: `${basePath}/{{pascalCase name}}/{{pascalCase name}}.test.tsx`,
          templateFile: 'tools/generators/templates/component-test.hbs',
        });
      }

      // Create story file if requested and for UI package
      if (data.withStory && data.package === 'ui') {
        actions.push({
          type: 'add',
          path: `${basePath}/{{pascalCase name}}/{{pascalCase name}}.stories.tsx`,
          templateFile: 'tools/generators/templates/component-story.hbs',
        });
      }

      return actions;
    },
  });

  plop.setGenerator('page', {
    description: 'Create a new page component',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Page name:',
        validate: value => {
          if (!value) return 'Page name is required';
          if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
            return 'Page name must be PascalCase';
          }
          return true;
        },
      },
      {
        type: 'list',
        name: 'app',
        message: 'Which app?',
        choices: ['web', 'mobile'],
        default: 'web',
      },
      {
        type: 'input',
        name: 'route',
        message: 'Route path (e.g., /dashboard):',
        default: answers => `/${answers.name.toLowerCase()}`,
      },
      {
        type: 'confirm',
        name: 'withTest',
        message: 'Include test file?',
        default: true,
      },
    ],
    actions: data => {
      const actions = [];
      const basePath = `apps/${data.app}/src/pages`;

      // Create page component
      actions.push({
        type: 'add',
        path: `${basePath}/{{pascalCase name}}/{{pascalCase name}}.tsx`,
        templateFile: 'tools/generators/templates/page.hbs',
      });

      // Create index file
      actions.push({
        type: 'add',
        path: `${basePath}/{{pascalCase name}}/index.ts`,
        templateFile: 'tools/generators/templates/page-index.hbs',
      });

      // Create test file if requested
      if (data.withTest) {
        actions.push({
          type: 'add',
          path: `${basePath}/{{pascalCase name}}/{{pascalCase name}}.test.tsx`,
          templateFile: 'tools/generators/templates/page-test.hbs',
        });
      }

      return actions;
    },
  });

  plop.setGenerator('api-route', {
    description: 'Create a new API route',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Route name (e.g., users, auth):',
        validate: value => {
          if (!value) return 'Route name is required';
          if (!/^[a-z][a-zA-Z0-9-]*$/.test(value)) {
            return 'Route name must be camelCase or kebab-case';
          }
          return true;
        },
      },
      {
        type: 'checkbox',
        name: 'methods',
        message: 'HTTP methods:',
        choices: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        default: ['GET', 'POST'],
        validate: value => {
          if (value.length === 0) return 'At least one method is required';
          return true;
        },
      },
      {
        type: 'confirm',
        name: 'withValidation',
        message: 'Include input validation schemas?',
        default: true,
      },
      {
        type: 'confirm',
        name: 'withTest',
        message: 'Include test file?',
        default: true,
      },
    ],
    actions: data => {
      const actions = [];

      // Create tRPC router
      actions.push({
        type: 'add',
        path: 'packages/api-contracts/src/routers/{{camelCase name}}.ts',
        templateFile: 'tools/generators/templates/api-router.hbs',
      });

      // Create API handler
      actions.push({
        type: 'add',
        path: 'apps/api/src/presentation/routes/{{camelCase name}}.ts',
        templateFile: 'tools/generators/templates/api-handler.hbs',
      });

      // Create validation schemas if requested
      if (data.withValidation) {
        actions.push({
          type: 'add',
          path: 'packages/api-contracts/src/schemas/{{camelCase name}}.ts',
          templateFile: 'tools/generators/templates/api-schema.hbs',
        });
      }

      // Create test file if requested
      if (data.withTest) {
        actions.push({
          type: 'add',
          path: 'apps/api/src/presentation/routes/{{camelCase name}}.test.ts',
          templateFile: 'tools/generators/templates/api-test.hbs',
        });
      }

      return actions;
    },
  });

  plop.setGenerator('package', {
    description: 'Create a new package',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Package name (without @company/ prefix):',
        validate: value => {
          if (!value) return 'Package name is required';
          if (!/^[a-z][a-z0-9-]*$/.test(value)) {
            return 'Package name must be lowercase with hyphens';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'description',
        message: 'Package description:',
        default: answers => `${answers.name} package for the fullstack monolith`,
      },
      {
        type: 'list',
        name: 'type',
        message: 'Package type:',
        choices: [
          { name: 'Library (TypeScript)', value: 'library' },
          { name: 'Service (Node.js)', value: 'service' },
          { name: 'Utilities', value: 'utils' },
        ],
        default: 'library',
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'packages/{{kebabCase name}}/package.json',
        templateFile: 'tools/generators/templates/package-json.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{kebabCase name}}/tsconfig.json',
        templateFile: 'tools/generators/templates/package-tsconfig.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{kebabCase name}}/jest.config.js',
        templateFile: 'tools/generators/templates/package-jest.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{kebabCase name}}/src/index.ts',
        templateFile: 'tools/generators/templates/package-index.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{kebabCase name}}/README.md',
        templateFile: 'tools/generators/templates/package-readme.hbs',
      },
    ],
  });

  // Helper functions
  plop.setHelper('eq', (a, b) => a === b);
  plop.setHelper('includes', (array, item) => array && array.includes(item));
  plop.setHelper('lowercase', str => str.toLowerCase());
  plop.setHelper('uppercase', str => str.toUpperCase());
};

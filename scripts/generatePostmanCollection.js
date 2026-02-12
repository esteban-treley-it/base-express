#!/usr/bin/env node

// Generates the Postman collection based on the current API surface.
// The collection is written to postman/base-express-api.postman_collection.json
// and keeps baseUrl/apiVersion templated so environments can override them.

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envCandidates = [
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '.env.docker'),
    path.join(__dirname, '..', '.env.example'),
];

const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
if (envPath) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config();
}

const OUTPUT_PATH = path.join(__dirname, '..', 'postman', 'base-express-api.postman_collection.json');
const BASE_URL_VAR = '{{baseUrl}}';
const API_VERSION_VAR = '{{apiVersion}}';

const envPort = process.env.PORT || '8000';
const envHost = process.env.HOST || 'localhost';
const defaultBaseUrl = process.env.POSTMAN_BASE_URL || `http://${envHost}:${envPort}`;
const defaultApiVersion = process.env.API_VERSION || 'v1';

const jsonHeaders = [{ key: 'Content-Type', value: 'application/json' }];
const bearerHeader = [{ key: 'Authorization', value: 'Bearer {{accessToken}}' }];

require('ts-node/register');
require('tsconfig-paths/register');

const { collectRoutes } = require('./postman/collectRoutes');
const { exampleForSchema } = require('./postman/zodExample');

const routesModule = require(path.join(__dirname, '..', 'src', 'routes'));
const rootRouter = routesModule.default || routesModule.router || routesModule;

const routes = collectRoutes(rootRouter).sort((a, b) => {
    if (a.path === b.path) return a.method.localeCompare(b.method);
    return a.path.localeCompare(b.path);
});

const tests = {
    setTokens: [
        'var jsonData = {};',
        'try { jsonData = pm.response.json(); } catch (e) {}',
        'if (jsonData.data && jsonData.data.accessToken) {',
        '    pm.collectionVariables.set("accessToken", jsonData.data.accessToken);',
        '    pm.collectionVariables.set("refreshToken", jsonData.data.refreshToken);',
        '    pm.collectionVariables.set("idToken", jsonData.data.idToken);',
        '}',
    ],
    updateTokens: [
        'var jsonData = {};',
        'try { jsonData = pm.response.json(); } catch (e) {}',
        'if (jsonData.data && jsonData.data.accessToken) {',
        '    pm.collectionVariables.set("accessToken", jsonData.data.accessToken);',
        '    pm.collectionVariables.set("refreshToken", jsonData.data.refreshToken);',
        '}',
    ],
    clearTokens: [
        'pm.collectionVariables.unset("accessToken");',
        'pm.collectionVariables.unset("refreshToken");',
        'pm.collectionVariables.unset("idToken");',
    ],
};

const testLinesForRoute = (route) => {
    if (route.method === 'POST' && route.path.endsWith('/auth/login')) return tests.setTokens;
    if (route.method === 'POST' && route.path.endsWith('/auth/refresh')) return tests.updateTokens;
    if (route.method === 'POST' && route.path.endsWith('/auth/logout')) return tests.clearTokens;
    return null;
};

const urlFor = (routePath) => {
    const cleanPath = routePath.startsWith('/') ? routePath : `/${routePath}`;
    const segments = cleanPath.replace(/^\//, '').split('/').filter(Boolean);
    return {
        raw: `${BASE_URL_VAR}/api/${API_VERSION_VAR}${cleanPath}`,
        host: [BASE_URL_VAR],
        path: ['api', API_VERSION_VAR, ...segments],
    };
};

const buildItem = ({ name, method, path: routePath, headers = [], body, description, testLines }) => ({
    name,
    ...(testLines
        ? {
            event: [
                {
                    listen: 'test',
                    script: {
                        exec: testLines,
                        type: 'text/javascript',
                    },
                },
            ],
        }
        : {}),
    request: {
        method,
        header: headers,
        ...(body ? { body: { mode: 'raw', raw: body } } : {}),
        url: urlFor(routePath),
        ...(description ? { description } : {}),
    },
    response: [],
});

const titleize = (value) => value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const groupNameForPath = (routePath) => {
    const segment = routePath.replace(/^\//, '').split('/')[0];
    if (!segment) return 'Root';
    return titleize(segment);
};

const grouped = new Map();

for (const route of routes) {
    const groupName = groupNameForPath(route.path);
    if (!grouped.has(groupName)) {
        grouped.set(groupName, []);
    }

    const requiresBody = ['POST', 'PUT', 'PATCH'].includes(route.method);
    const schemaExample = route.schema ? exampleForSchema(route.schema) : null;
    const body = requiresBody
        ? JSON.stringify(schemaExample || {}, null, 2)
        : null;

    const headers = [];
    if (requiresBody) headers.push(...jsonHeaders);
    if (route.authRequired) headers.push(...bearerHeader);

    const descriptionParts = [];
    if (route.authRequired) descriptionParts.push('Requires authentication.');
    if (route.schema) descriptionParts.push('Request body generated from Zod schema.');

    grouped.get(groupName).push(buildItem({
        name: `${route.method} ${route.path}`,
        method: route.method,
        path: route.path,
        headers,
        body,
        description: descriptionParts.join(' '),
        testLines: testLinesForRoute(route),
    }));
}

const collection = {
    info: {
        _postman_id: 'base-express-collection',
        name: 'Base Express API',
        description: 'API collection generated from the Express router definitions.',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: Array.from(grouped.entries()).map(([name, item]) => ({
        name,
        item,
    })),
    variable: [
        { key: 'baseUrl', value: defaultBaseUrl },
        { key: 'apiVersion', value: defaultApiVersion },
    ],
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(collection, null, 2));
console.log(`Postman collection written to ${OUTPUT_PATH}`);

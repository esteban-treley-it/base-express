const normalizePath = (basePath, path) => {
    const strip = (value) => (value || '').replace(/^\/+|\/+$/g, '');
    const parts = [strip(basePath), strip(path)].filter(Boolean);
    return parts.length ? `/${parts.join('/')}` : '/';
};

const parseLayerPath = (layer) => {
    if (layer.path) return layer.path;
    if (!layer.regexp) return '';
    if (layer.regexp.fast_slash) return '';

    let path = layer.regexp.source;

    // Remove anchors and trailing optional patterns
    path = path
        .replace(/^\^\\\//, '/')
        .replace(/\\\/\?\(\?=\\\/\|\$\)/g, '')
        .replace(/\(\?=\\\/\|\$\)/g, '')
        .replace(/\\\/\?\$/g, '')
        .replace(/\$$/, '');

    const keys = layer.keys || [];
    let keyIndex = 0;

    // Replace capture groups with parameter tokens
    path = path.replace(/\((?:\?:)?[^)]*\)/g, (match) => {
        const key = keys[keyIndex++]?.name || 'param';
        const needsSlash = match.includes('\\/');
        return `${needsSlash ? '/' : ''}:${key}`;
    });

    // Unescape common tokens
    path = path.replace(/\\\//g, '/').replace(/\\\./g, '.');

    // Clean up remaining regex tokens
    path = path.replace(/\?/g, '');

    if (!path.startsWith('/')) {
        path = `/${path}`;
    }

    return path;
};

const getRouteSchema = (stack) => {
    for (const layer of stack || []) {
        if (layer?.handle?.schema) return layer.handle.schema;
    }
    return null;
};

const hasAuthMiddleware = (layer) => {
    const handle = layer?.handle;
    return Boolean(handle?.auth || handle?.middlewareType === 'auth' || handle?.name === 'authLoggingMiddleware');
};

const isAuthRoute = (stack) => (stack || []).some(hasAuthMiddleware);

const matchesScope = (routePath, scope) => {
    if (scope === '/') return true;
    return routePath === scope || routePath.startsWith(`${scope}/`);
};

const collectRoutes = (router, basePath = '', authScopes = []) => {
    const routes = [];
    const stack = router?.stack || [];
    const scopedAuth = [...authScopes];

    for (const layer of stack) {
        if (layer.route) {
            const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
            const methods = Object.keys(layer.route.methods || {}).filter((method) => layer.route.methods[method]);
            const schema = getRouteSchema(layer.route.stack);

            for (const path of paths) {
                const fullPath = normalizePath(basePath, path);
                const authRequired = isAuthRoute(layer.route.stack) || scopedAuth.some((scope) => matchesScope(fullPath, scope));
                for (const method of methods) {
                    routes.push({
                        method: method.toUpperCase(),
                        path: fullPath,
                        schema,
                        authRequired,
                    });
                }
            }
        } else if (layer.name === 'router' && layer.handle?.stack) {
            const layerPath = parseLayerPath(layer);
            const nextBase = normalizePath(basePath, layerPath);
            routes.push(...collectRoutes(layer.handle, nextBase, scopedAuth.slice()));
        } else if (hasAuthMiddleware(layer)) {
            const layerPath = parseLayerPath(layer);
            const scopePath = normalizePath(basePath, layerPath);
            scopedAuth.push(scopePath);
        }
    }

    return routes;
};

module.exports = {
    collectRoutes,
    normalizePath,
};

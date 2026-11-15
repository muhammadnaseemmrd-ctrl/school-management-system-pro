const models = new Map();
module.exports = { models, get: (n) => models.get(n), names: () => [...models.keys()] };
